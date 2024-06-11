#!/bin/sh

path=`dirname $0`

# start an instance of the PHP internal httpd server
# needed to interactively execute WPT tests in browsers

php -S localhost:8000 -t ../wpt/ ./test/wpt/router.php
