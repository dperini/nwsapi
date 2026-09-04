Anchor the :required and :optional tests, and let :optional take a button

/^input|select|textarea$/ alternates '^input' with 'select' and with 'textarea$' rather than anchoring an alternation, so it accepts any element whose name begins with 'input', any name containing 'select', and any ending in 'textarea'. Both pseudo-classes use it.
 ':optional' also has to match button elements, which the HTML spec lists first among the ones it matches and which Blink answers true for outright. https://github.com/chromium/chromium/blob/155.0.8041.1/third_party/blink/renderer/core/html/forms/html_button_element.h#L113
 A button has no required property, so '!e.required' is true for one and the list is the only change needed.
