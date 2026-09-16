#!/bin/sh
#
# Run python using venv
#

set -euf
(set -o pipefail >/dev/null 2>&1) && set -o pipefail || :

export PYS=$(readlink -f "$0")
mydir=$(dirname "$PYS")
venv="$mydir/.venv"

###$_begin-include: pysetup.sh

pysetup() {
  local pyenvdir="" ospkgs="" pippkgs="" reqs="" reinstall=false
  while [ $# -gt 0 ]
  do
  	case "$1" in
  	  --venv=*) pyenvdir=${1#--venv=} ;;
  	  --ospkgs=*) ospkgs="$ospkgs $(echo "${1#--ospkgs=}" | sed -e s'/#.*$//')" ;;
  	  --pkgs=*) pippkgs="$pippkgs $(echo "${1#--pkgs=}" | sed -e s'/#.*$//')" ;;
  	  --reqs=*) reqs="$reqs ${1#--reqs=}" ;;
  	  --reinstall) reinstall=true ; break ;;
  	  --)
    	shift
    	[  $# -gt 0 ] && [ x"$1" = x"--reinstall" ] && reinstall=true
    	break
    	;;
  	  *) break
  	esac
    shift
  done
  if [ -z "$pyenvdir" ] ; then
    echo "No pyenvdir specified" 1>&2
    exit 1
  fi
  if $reinstall ; then
    if [ -d "$pyenvdir" ] ; then
      if [ ! -f "$pyenvdir/bin/activate" ] ; then
        echo "Configuration error in re-install" 1>&2
        exit 2
      fi
      rm -rf "$pyenvdir"
    fi
  fi

  local dsc=$(
  	readlink -f "$pyenvdir"
  	echo '>>> OS:' "$ospkgs"
  	echo '>>> PIP:' "$pippkgs"
  	if [ -n "$reqs" ] ; then
	  for r in $reqs
	  do
	    echo '>>> REQS:' "$r"
	    cat "$r" 2>/dev/null
	  done
  	fi
  	echo '>>> pysetup'
  	declare -f pysetup || :
  )
  if [ -d "$pyenvdir" ] ; then
    local cur=$(cat "$pyenvdir/state.txt" || :)
    if [ x"$cur" = x"$dsc" ] ; then
      . "$pyenvdir"/bin/activate
      return 0
    fi
    if [ ! -f "$pyenvdir/bin/activate" ] ; then
      echo "Configuration error" 1>&2
      exit 2
    fi
    rm -rf "$pyenvdir"
  fi

  # Check for pre-requisites
  local missing="" r
  if type xbps-query >/dev/null 2>&1 ; then
    for r in $ospkgs
    do
      xbps-query "$r" || missing="$missing $r"
    done
    if [ -n "$missing" ] ; then
      echo "Missing packages:$missing" 1>&2
      exit 34
    fi
  fi

  echo -n "Creating $pyenvdir..."
  python3 -m venv --system-site-packages "$pyenvdir"
  echo "OK"
  (
    . "$pyenvdir"/bin/activate
    [ -n "$pippkgs" ] && pip install $pippkgs
    if [ -n "$reqs" ] ; then
      for requirement in $reqs
      do
	pip install --requirement "$requirement"
      done
    fi
    :
  ) || exit 1
  echo "$dsc" > "$pyenvdir/state.txt"
  $reinstall && exit 0
  . "$pyenvdir"/bin/activate
}


###$_end-include: pysetup.sh
pysetup \
	--venv="$venv" \
	--ospkgs='
		# python3-cryptography python3-rpds-py
	' \
	--pkgs="
		icecream
	" \
	--reqs=$mydir/requirements.txt \
	-- "$@"

########################################################
export PYTHONPATH=${PYTHONPATH:-}:$mydir/src
export ANSIBLE_INJECT_FACT_VARS=True

int_help() {
  : HELP '* --help - show help'
  cat <<-_EOF_
	Availble commands:

	* --reinstall : re-install python virtual environment
	_EOF_
  if type declare >/dev/null 2>&1 ; then
    declare -f | grep '^[ 	]*: HELP' \
      | sed -e"s/^[ 	]*: HELP '//" -e "s/';\$//"
  else
    echo ''
    echo 'No further help aviable'
  fi
}


if [ $# -eq 0 ] ; then
  cat <<-_EOF_
	Usage: $0 [options [--]] [cmd ... args ...]

	Options:

	Use "$0 --help" for help.

	_EOF_
  python3 -V
  exit $?
fi

if type "int_${1#--}" >/dev/null 2>&1 ; then
  cmd="int_${1#--}" ; shift
  "$cmd" "$@"
elif type "$1" >/dev/null 2>&1 ; then
  "$@"
else
  exec python3 "$@"
fi



