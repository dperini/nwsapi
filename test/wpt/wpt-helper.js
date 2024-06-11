// ====================================================================

var stateObj = { 'start': 'nw' };

if (window.location.hash == '') {
    window.history.replaceState(stateObj, 'nwsapi', '#nw' );
}

//NW.Dom.install(true);

function handleState(e) {
    if ((e.ctrlKey && e.altKey) || e.type == 'keypress') {
        switch (window.location.hash) {
            case '#nw':
                window.history.replaceState(stateObj, 'w3capi', '#w3' );
                window.location.hash = '#w3';
                NW.Dom.uninstall(true);
                break;
            case '#w3':
                window.history.replaceState(stateObj, 'nwsapi', '#nw' );
                window.location.hash = '#nw';
                NW.Dom.install(true);
                break;
            default:
                break;
        }
    }
}

handleState({ type: 'keypress' });

window.addEventListener('keypress', handleState);

// ===== END: nwsapi seamless integration plugin for wpt testing ======
