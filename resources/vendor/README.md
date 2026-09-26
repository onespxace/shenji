# Bundled optional tools

This directory is reserved for offline helper binaries and language data. The desktop app itself does not execute an external tool without an explicit user action.

- `duckdb/duckdb.exe` — local analytical SQL CLI, MIT License.
- `ocr/` — English and Simplified Chinese OCR model data used by the explicit document extraction action.

The desktop app exposes DuckDB only after the user opens the SQL workbench, and OCR only after the user explicitly extracts a document. It does not download or execute tools silently.
