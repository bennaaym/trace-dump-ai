# Number plate recognition

Enable local plate recognition for an analysis-enabled monitoring run with `--recognize-plates`. It runs only after a positive analysis creates a suspected incident and exports the original XProtect recording. It does not change the Hafnia prompt or classification.

```powershell
.\.venv\Scripts\video-analytics.exe monitor --camera demo_real_dumping_plate_ipoh --duration 45 --fps 5 --detect --yolo-model ".\models\yolo11n.pt" --recognize-plates --simulation-run ipoh-plates-manual-001 --max-hafnia-requests 1
```

Use a new simulation-run ID for another submission. No/uncertain classifications still produce no incident. Negative analyses are not changed to positive to display plate results.

## Runtime and models

The optional CPU dependency is `python -m pip install -e ".[plates]"`. The current development environment already has ONNX Runtime and the local models. No model weights are downloaded automatically. Other environments must provide these supported local files under `video-analytics/models/plates/` or pass `--plate-models-dir`:

- `yolo-v9-t-384-license-plates-end2end.onnx`: 384x384 RGB CHW float detector, end-to-end seven-column output.
- `cct_xs_v1_global.onnx`: 64x128 RGB NHWC uint8 OCR, nine slots and the alphabet `0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_`.

The implementation supports the accompanying CCT v1 configuration (RGB, resize without aspect preservation). It does not attempt to interpret arbitrary model configurations. Input/output contracts are checked and model SHA-256 hashes are saved with evidence. No new environment variables or database migration are required.

Detector preprocessing follows the model project's [YOLOv9 preprocessing](https://github.com/ankandrew/open-image-models/blob/main/open_image_models/detection/core/yolo_v9/preprocess.py); OCR input convention is described by [FastPlateOCR](https://ankandrew.github.io/fast-plate-ocr/latest/reference/core/process/).

## Evidence and limits

At most 32 frames are sampled evenly across the export. Up to eight candidate text groups are retained; these groups are not vehicle identities. A minimum selected-character score of 0.8 is required before presenting OCR text. Scores are model outputs, not calibrated probabilities of correctness. Low-confidence text stays null and is displayed as Unreadable. Sampling can miss a plate visible only between selected frames.

Plate crops and their full original source frames are separate private evidence objects with hashes, actual offsets, and worker-generated IDs. Crop metadata links to its source evidence ID and records the bounding box, model hashes, OCR result, and unverified vehicle association. Existing incident evidence metadata records whether the scan completed, failed, or was not requested. Plate-processing failure does not erase event evidence or change the classification.

Overview and AI Analysis show Number plate evidence, crop links, original-frame links, and Watch plate moment. Automatic readings need human verification. A visible plate does not establish the vehicle's involvement; association is currently always unverified. Plates mentioned only in the VLM narrative are not promoted to OCR results. Existing incidents are not automatically reprocessed.

## Verification

Initial local checks sampled the real Ipoh XProtect AVI and produced AHN9916 plus an unreadable candidate. Offline integration used real frames/OCR with an explicitly synthetic positive VLM fixture.

The subsequent real XProtect → Hafnia → Supabase → authenticated UI run on 24 October 2026 produced incident `1610ff1b-eac8-55f0-9ce1-f58a02e9919f` with an AHN9916 crop/source pair. Browser checks confirmed the separate plate card. This verifies integration, not a general OCR accuracy benchmark or vehicle involvement. That historical incident and its camera registration were no longer present in the shared database on 25 October. See the [integration notes](../docs/FEATURES_1_TO_4_INTEGRATION.md) for the current checks and manual video test. Report generation is outside this integration.
