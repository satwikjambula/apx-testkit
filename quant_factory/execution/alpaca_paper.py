"""Explicit-confirmation Alpaca paper-trading adapter; never loads live credentials."""

import os
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True, slots=True)
class PaperOrder:
    symbol: str
    quantity: int
    side: str

    def __post_init__(self) -> None:
        if self.quantity < 1:
            raise ValueError("quantity must be positive")
        if self.side not in {"buy", "sell"}:
            raise ValueError("side must be buy or sell")


@dataclass(frozen=True, slots=True)
class PaperOrderReceipt:
    order_id: str
    status: str


@dataclass(frozen=True, slots=True)
class _TestOrderRequest:
    symbol: str
    qty: int
    side: str


class AlpacaPaperBroker:
    """Alpaca's paper endpoint only, protected by caller confirmation."""

    def __init__(self, client: Any | None = None) -> None:
        self._injected_client = client is not None
        self._client = client or self._paper_client()

    @staticmethod
    def _paper_client() -> Any:
        api_key = os.environ.get("ALPACA_PAPER_API_KEY")
        secret_key = os.environ.get("ALPACA_PAPER_SECRET_KEY")
        if not api_key or not secret_key:
            raise RuntimeError("Set ALPACA_PAPER_API_KEY and ALPACA_PAPER_SECRET_KEY for paper trading")
        try:
            from alpaca.trading.client import TradingClient
        except ImportError as error:  # pragma: no cover - requires optional package
            raise RuntimeError("Install autonomous-alpha-factory[paper-trading] for Alpaca paper trading") from error
        return TradingClient(api_key, secret_key, paper=True)

    def submit(self, order: PaperOrder, *, confirm: bool = False) -> PaperOrderReceipt:
        if not confirm:
            raise PermissionError("Paper orders require explicit confirm=True")
        request = self._request(order)
        submitted = self._client.submit_order(order_data=request)
        return PaperOrderReceipt(str(submitted.id), str(submitted.status))

    def _request(self, order: PaperOrder) -> Any:
        if self._injected_client:
            return _TestOrderRequest(order.symbol, order.quantity, order.side)
        from alpaca.trading.enums import OrderSide, TimeInForce
        from alpaca.trading.requests import MarketOrderRequest
        return MarketOrderRequest(symbol=order.symbol, qty=order.quantity, side=OrderSide(order.side), time_in_force=TimeInForce.DAY)
