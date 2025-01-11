#!/bin/sh

path=`dirname $0`

#
# NOTE: All this is preliminary work in progress.
#
# Both wpt and nwsapi repositories must be installed
# side by side at the same folder level to have them
# work together smoothly as intended for these tests.
#
# A working instance of PHP is needed to setup the
# local server, then from the main nwsapi folder
# execute the provided shell to setup for testing
# using the following terminal command:
#
#      test/wpt/wpt.sh
#
# this will start the PHP local server and listen
# for browser connections on port 8000, after this
# you should be able to open the followeing URL:
#
#      http://localhost:8000
#
# After loading one of the tests, you willl have the
# option to execute it using the browser internal QS
# API or nwsapi alternatedly by pressing the reload
# button (CTRL-R in browsers), or the RERUN button
# found in each of the test pages itself.
#
# Each reload will change the environment used
# from browser intrernal QS api to nwsapi 
#

cp ./test/wpt/favicon.svg ../wpt/
cp ./test/wpt/index.html ../wpt/

# start an instance of the PHP internal httpd server
# needed to interactively execute WPT tests in browsers

php -S localhost:8000 -t ../wpt/ ./test/wpt/router.php
