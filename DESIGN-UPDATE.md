# VillaCheck design update

Design 1 is the primary layout and palette. Small Design 3 accents add a numbered verification record, fine dividers and status outlines.

Mobile updates: collapsible portal navigation, accessible public menu, larger controls, responsive forms and locally bundled fonts.

Validation: TypeScript and production build passed. Browser route checks at 320, 390, 768 and 1365px passed with no horizontal overflow or runtime errors. Mobile menu and logout checked. External property photos were blocked during layout QA. Camera access was not tested on a physical phone.

This remains a frontend prototype with dummy data; no production backend was added.

Run: npm install, then npm run dev. Build: npm run build.
Copy source into your existing Git clone, preserving its .git directory, then commit and push.
