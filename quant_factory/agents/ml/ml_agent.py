"""Model-science specialist."""

from quant_factory.models.trainer import ModelTrainer


class MLAgent:
    name = "MLAgent"
    role = "Model scientist"

    def __init__(self, trainer: ModelTrainer) -> None:
        self.trainer = trainer
