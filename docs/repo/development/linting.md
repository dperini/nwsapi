# Linting

`npm run lint` checks `src/nwsapi.js` with ESLint's recommended correctness rules
for the existing ES2015 source. The prior ESLint configuration was not backed by
a declared dependency and reported hundreds of pre-existing style violations.
This maintained flat configuration replaces those inactive rules without
requiring a broad source reformat. Narrow allowances preserve callback
signatures, ignored parse failures, and the `initEnv` initializer side effect.

ESLint 10 requires Node.js 20.19+, 22.13+, or 24+. The CI matrix uses Node.js
22 and 24, and the setup action provides the pinned runtime locally.
