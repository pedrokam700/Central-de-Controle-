"""Disposable Windows CI listener for a read-only process witness test.

No A-MES import, no port 8765, no credentials, no files and no network outside
127.0.0.1. The owning PowerShell fixture terminates only this child process.
"""

import socket
import time


with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
    listener.bind(("127.0.0.1", 0))
    listener.listen(1)
    print(listener.getsockname()[1], flush=True)
    time.sleep(30)
