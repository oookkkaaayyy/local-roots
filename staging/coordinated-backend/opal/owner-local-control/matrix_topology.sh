#!/bin/sh
# Pure, fail-closed check for the installed 2D Matrix + companion layout.
# Arguments: total LEDs, Matrix start/stop/startY/stopY, companion start/stop, AUX LEDs.
matrix_topology_valid() {
  [ "$#" -eq 8 ] || return 1
  [ "$1" = "534" ] &&
    [ "$2" = "0" ] && [ "$3" = "32" ] &&
    [ "$4" = "0" ] && [ "$5" = "16" ] &&
    [ "$6" = "512" ] && [ "$7" = "534" ] &&
    [ "$8" = "22" ]
}
