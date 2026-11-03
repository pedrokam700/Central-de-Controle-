"""Authenticated drain protocol for Issue #57's external coordinator.

Transport-neutral, deliberately NOT registered with HTTP or agent startup.
Enrollment of the installed guardian, Windows identity/ACL and browser writers
is still required before connecting this protocol to an operational agent.
Use a fresh, independent 256-bit maintenance key, never the browser/MES token.
Neither quiescence nor possession of this key authorizes replacing files.
"""

import hashlib
import hmac
import json
import os
import re
import secrets
from threading import Lock

SCHEMA = "ames-maintenance-drain-v1"
MAX_MESSAGE = 4096


class ProtocolRejected(ValueError):
    """Sanitized rejection; never include the supplied message or credential."""


def _hex(value, length):
    return type(value) is str and re.fullmatch("[0-9a-f]{%d}" % length, value) is not None


def _key(key):
    if type(key) is not bytes or len(key) != 32:
        raise ProtocolRejected("maintenance_key_invalid")
    return key


def _canonical(body):
    return json.dumps(body, sort_keys=True, separators=(",", ":"), allow_nan=False).encode("utf-8")


def seal(key, body, direction):
    payload = _canonical(body)
    signature = hmac.new(_key(key), direction.encode("ascii") + b"\0" + payload,
                         hashlib.sha256).hexdigest()
    wire = _canonical({"body": body, "mac": signature})
    if len(wire) > MAX_MESSAGE:
        raise ProtocolRejected("maintenance_message_too_large")
    return wire


def unseal(key, wire, direction):
    try:
        if type(wire) is not bytes or len(wire) > MAX_MESSAGE:
            raise ValueError()
        envelope = json.loads(wire)
        if (type(envelope) is not dict or set(envelope) != {"body", "mac"}
                or type(envelope["body"]) is not dict or not _hex(envelope["mac"], 64)):
            raise ValueError()
        body = envelope["body"]
        expected = hmac.new(_key(key), direction.encode("ascii") + b"\0" + _canonical(body),
                            hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected, envelope["mac"]):
            raise ValueError()
        return body
    except (ValueError, TypeError, UnicodeError, RecursionError):
        raise ProtocolRejected("maintenance_message_untrusted") from None


def validate_target(target):
    if (type(target) is not dict
            or set(target) != {"installation_sha256", "agent_instance", "pid"}
            or not _hex(target["installation_sha256"], 64)
            or not _hex(target["agent_instance"], 64)
            or type(target["pid"]) is not int or target["pid"] <= 0):
        raise ProtocolRejected("maintenance_target_invalid")
    return dict(target)


class DrainSession:
    """One transaction, bound to this process incarnation and admission fence.

    No TTL auto-release: lost transport/response must leave the fence closed.
    The coordinator owns durable claim recovery; this object cannot delete it.
    """

    def __init__(self, admission, observe_runtime, key, installation_sha256, transaction_id):
        if not _hex(transaction_id, 32):
            raise ProtocolRejected("maintenance_transaction_invalid")
        self.target = validate_target({"installation_sha256": installation_sha256,
                                       "agent_instance": secrets.token_hex(32), "pid": os.getpid()})
        self._key = _key(key)
        self._transaction = transaction_id
        self._admission = admission
        self._observe_runtime = observe_runtime
        self._lease = None
        self._sequence = 0
        self._finished = False
        self._lock = Lock()

    def handle(self, wire):
        request = unseal(self._key, wire, "request")
        with self._lock:
            if (set(request) != {"schema", "transaction_id", "target", "sequence", "operation"}
                    or request["schema"] != SCHEMA or request["transaction_id"] != self._transaction
                    or validate_target(request["target"]) != self.target
                    or type(request["sequence"]) is not int
                    or request["sequence"] != self._sequence + 1
                    or request["operation"] not in ("begin", "poll", "cancel")
                    or self._finished):
                raise ProtocolRejected("maintenance_session_mismatch")
            op = request["operation"]
            if (op == "begin" and self._lease is not None) or (op != "begin" and self._lease is None):
                raise ProtocolRejected("maintenance_operation_out_of_order")
            # All authentication/identity/sequence checks precede mutation.
            if op == "begin":
                self._lease = self._admission.begin_drain()
            self._sequence = request["sequence"]
            if op == "cancel":
                self._admission.release_drain(self._lease)
                self._lease = None
                self._finished = True
                state = "cancelled_before_update"
            else:
                state = "draining"
                try:
                    counted_idle = self._admission.wait_for_quiescence(self._lease, 0)
                    runtime = self._observe_runtime()
                    if (counted_idle and runtime.get("idle_observed") is True
                            and runtime.get("observation_stable") is True
                            and runtime.get("new_admissions_fenced") is True):
                        state = "agent_quiescent_only"
                except Exception:
                    state = "runtime_unverified"
            return seal(self._key, {**request, "state": state,
                                   "new_admissions_fenced": self._lease is not None,
                                   "update_authorized": False}, "response")


class DrainClient:
    """External-side protocol; ambiguous transport failures forbid retries.

    exchange accepts/returns bounded bytes, not pickle or arbitrary Python.
    A recovery workflow must reconcile the durable journal on uncertainty.
    """

    def __init__(self, exchange, key, target, transaction_id):
        if not _hex(transaction_id, 32):
            raise ProtocolRejected("maintenance_transaction_invalid")
        self._exchange, self._key = exchange, _key(key)
        self.target, self.transaction_id = validate_target(target), transaction_id
        self._sequence, self._uncertain = 0, False

    def request(self, operation):
        if self._uncertain:
            raise ProtocolRejected("maintenance_recovery_required")
        request = {"schema": SCHEMA, "transaction_id": self.transaction_id,
                   "target": self.target, "sequence": self._sequence + 1, "operation": operation}
        try:
            response = unseal(self._key, self._exchange(seal(self._key, request, "request")), "response")
            if (set(response) != set(request) | {"state", "new_admissions_fenced", "update_authorized"}
                    or any(response.get(k) != v for k, v in request.items())
                    or response["update_authorized"] is not False
                    or response["state"] not in {"draining", "runtime_unverified", "agent_quiescent_only", "cancelled_before_update"}
                    or response["new_admissions_fenced"] is not (operation != "cancel")
                    or (response["state"] == "cancelled_before_update") != (operation == "cancel")):
                raise ProtocolRejected("maintenance_response_mismatch")
            self._sequence += 1
            return response
        except Exception:
            self._uncertain = True
            raise ProtocolRejected("maintenance_recovery_required") from None


def serve_connection(connection, session):
    """Serve a pre-established local IPC handle; never opens a TCP listener.

    Not wired to the installed agent. No finally block may release its drain.
    recv_bytes bounds input before decoding; Connection.recv/pickle is unused.
    """
    try:
        while True:
            wire = connection.recv_bytes(MAX_MESSAGE)
            connection.send_bytes(session.handle(wire))
    except (EOFError, OSError, ProtocolRejected):
        return
    finally:
        connection.close()
