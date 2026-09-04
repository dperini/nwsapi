A fieldset is :valid when none of its controls is invalid

':valid' asks whether a fieldset contains a ':valid' descendant. The rule is that none of its controls may be invalid, which is a different thing: a fieldset holding no validation candidates at all is valid, and was matching neither ':valid' nor ':invalid'. A fieldset inside a disabled fieldset is the common case, since every control under it is barred from validation.
 Blink answers true for a fieldset's validity pseudo-classes and then loops its controls, failing only on one that is a candidate and invalid. https://github.com/chromium/chromium/blob/155.0.8041.1/third_party/blink/renderer/core/html/forms/html_field_set_element.cc#L108
