from pathlib import Path

import polars as pl

from quant_factory.features.store import FeatureStore


def test_feature_store_writes_immutable_snapshot_and_manifest(tmp_path: Path) -> None:
    store = FeatureStore(tmp_path)
    frame = pl.DataFrame({"symbol": ["SPY"], "timestamp": ["2024-01-02"], "return_1": [0.01]})

    snapshot = store.publish("momentum", frame, source_dataset="spy_v1")
    restored = store.load(snapshot.snapshot_id)

    assert restored.equals(frame)
    assert snapshot.row_count == 1
    assert snapshot.source_dataset == "spy_v1"
    assert store.publish("momentum", frame, source_dataset="spy_v1").snapshot_id == snapshot.snapshot_id
