"""Governance policy helpers."""


def can_approve(creator: str, reviewer: str) -> bool:
    return creator != reviewer
