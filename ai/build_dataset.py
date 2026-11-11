#!/usr/bin/env python3
"""Root wrapper allowing `python ai/build_dataset.py` execution."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from scripts.build_dataset import main

if __name__ == "__main__":
    main()

