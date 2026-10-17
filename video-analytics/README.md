# TraceDump video analytics

This is the importable Python scaffold for the TraceDump AI video worker. It intentionally contains no acquisition, detection, Hafnia, evidence, or persistence implementation.

Python 3.11 is the migration baseline because it offers broad compatibility with common OpenCV and YOLO ecosystems. The scaffold declares support for Python 3.11 through 3.13 and is currently validated on Python 3.13; exact computer-vision, SDK, and GPU dependencies will be selected while migrating the existing worker rather than guessed here.

The package expects configuration in the process environment. It does not automatically load the repository-root `.env`; supply variables through the activated shell, service runner, or deployment environment.

```bash
python -m pip install -e ".[dev]"
video-analytics
python -m pytest
python -m ruff check .
python -m ruff format --check .
```
