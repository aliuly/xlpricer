#!/bin/sh
#
mydir=$(dirname "$0")
[ ! -f xlpricer.py ] && ln -sf xlpricer/__main__.py xlpricer.py
"$mydir/wine" xlpricer.py --onefile --noupx
