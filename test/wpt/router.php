<?php

// router.php
if (preg_match('/resources\/testharness\.js$/', $_SERVER["REQUEST_URI"])) {
    
    header("Content-Type: text/javascript");

    readfile('./src/nwsapi.js');
    readfile('./test/wpt/wpt-helper.js');
    readfile('../wpt/resources/testharness.js');
    
} else {
    
    return false;

}

?>
