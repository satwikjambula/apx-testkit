"""Data quality specialist."""

from quant_factory.data.ingestion import MarketDataIngestor


class DataAgent:
    name = "DataAgent"
    role = "Data steward"

    def __init__(self) -> None:
        self.ingestor = MarketDataIngestor()
