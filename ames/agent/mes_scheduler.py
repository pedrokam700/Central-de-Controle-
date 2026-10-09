"""One FIFO gate for this agent's MES session. No lock around storage/reporting."""
from collections import deque
from contextlib import contextmanager
from functools import wraps
from threading import Condition, local


class Cancelled(BaseException):
    """Cooperative cancellation cannot be swallowed by collector Exception handlers."""


class MonitorSkipped(BaseException):
    pass


class MesScheduler:
    def __init__(self):
        self.condition = Condition()
        self.queue = deque()
        self.owner = None
        self.normal_jobs = 0
        self.context = local()

    @contextmanager
    def job(self, token=None, monitor=False, status=None, reservation=None):
        previous = getattr(self.context, 'job', None)
        self.context.job = dict(token=token, monitor=monitor, status=status, reservation=reservation)
        normal = not monitor and reservation is None
        if normal:
            with self.condition:
                self.normal_jobs += 1
        try:
            yield
            if token is not None and token.is_set():
                raise Cancelled()
        finally:
            with self.condition:
                if normal:
                    self.normal_jobs -= 1
                if reservation is not None and self.owner is reservation:
                    self.owner = None
                    self.condition.notify_all()
            self.context.job = previous

    def reserve_monitor(self):
        with self.condition:
            if self.owner is not None or self.queue or self.normal_jobs:
                return None
            ticket = object()
            self.owner = ticket
            return ticket

    def wake(self):
        with self.condition:
            self.condition.notify_all()

    def snapshot(self):
        with self.condition:
            return dict(busy=self.owner is not None, queued=len(self.queue), policy='fifo-monitor-skip-v1')

    @contextmanager
    def critical(self, cleanup=False):
        if getattr(self.context, 'depth', 0):
            yield
            return
        job = getattr(self.context, 'job', None) or {}
        token = None if cleanup else job.get('token')
        status = job.get('status')
        ticket = job.pop('reservation', None)
        acquired = False
        try:
            with self.condition:
                if token is not None and token.is_set():
                    raise Cancelled()
                if ticket is None:
                    ticket = object()
                    if job.get('monitor') and not cleanup:
                        if self.owner is not None or self.queue or self.normal_jobs:
                            raise MonitorSkipped()
                        self.owner = ticket
                    else:
                        self.queue.append(ticket)
                        # Status callback is outside JOBS_LOCK at every call site.
                        if status and (self.owner is not None or self.queue[0] is not ticket):
                            status('waiting_mes')
                        while self.owner is not None or self.queue[0] is not ticket:
                            if token is not None and token.is_set():
                                raise Cancelled()
                            self.condition.wait()
                        if token is not None and token.is_set():
                            raise Cancelled()
                        self.queue.popleft()
                        self.owner = ticket
                acquired = True
                self.context.depth = 1
            if status:
                status('active_mes')
            yield
            if token is not None and token.is_set():
                raise Cancelled()
        finally:
            with self.condition:
                if ticket in self.queue:
                    self.queue.remove(ticket)
                if ticket is not None and self.owner is ticket:
                    self.owner = None
                if acquired:
                    self.context.depth = 0
                self.condition.notify_all()


MES = MesScheduler()


def mes_call(function):
    @wraps(function)
    def guarded(*args, **kwargs):
        with MES.critical():
            return function(*args, **kwargs)
    return guarded


class SessionObject:
    """Gate whole view queries/navigation, not individual DOM reads within them.

    Transformation/checkpoint/persistence in the calling engine flow stays outside.
    Each job retains its own Playwright handle on its original thread, connected
    to the same existing CDP session. No browser/session is created here.
    """
    def __init__(self, target):
        self._target = target

    def __getattr__(self, name):
        value = getattr(self._target, name)
        if not callable(value):
            return value
        @wraps(value)
        def call(*args, **kwargs):
            try:
                with MES.critical(cleanup=name == 'disconnect'):
                    result = value(*args, **kwargs)
                    return self if result is self._target else result
            except BaseException:
                # Cancellation may be raised by critical.__exit__ after connect.
                # Tear down only this thread's handle, never the shared browser.
                if name == 'connect':
                    with MES.critical(cleanup=True):
                        self._target.disconnect()
                raise
        return call


def session_object(target):
    return SessionObject(target)
