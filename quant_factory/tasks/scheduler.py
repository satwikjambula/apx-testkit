"""Small scheduler façade; host applications decide how often to invoke it."""

from collections.abc import Callable


class ResearchScheduler:
    def __init__(self, job: Callable[[], None]) -> None:
        self.job = job
        self.runs = 0

    def run_once(self) -> None:
        self.job()
        self.runs += 1
