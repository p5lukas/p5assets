import os
import sys
import tempfile
from pathlib import Path

_tmp = tempfile.mkdtemp(prefix="p5cfg-")
os.environ["P5_CONFIG_DIR"] = _tmp
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
