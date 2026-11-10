/** Trusted exact-byte technical interpretations. This is not artifact-supplied permission.
 * Context bytes are retained for independent technical review. Any changed artifact or
 * another occurrence requires new evidence; no runtime or section-wide exemption exists. */
export const reviewedMetadata = [
  {
    "artifactSha256": "0de67be325823e52773d662b861af0f1370658ebb539f3b89356b55f5e1aed22",
    "artifactSize": 426480,
    "target": "server",
    "path": "build/server/run",
    "embedded": {
      "offset": 45224,
      "size": 283197,
      "sha256": "5a78668d4713a44488fb4da36d55dfbf4a38fee3dee9b8404844e3e29adf5873"
    },
    "occurrences": [
      {
        "offset": 46221,
        "rawLength": 9,
        "rawSha256": "12ca17b49af2289436f303e0166030a21e525d266e209267433801a8fd4071a0",
        "host": "127.0.0.1",
        "id": "kestrel-jsc-macos13-arm64-46221",
        "revision": "ew.technical-occurrence.v1",
        "interpretation": "URL shim reflective hostname. Constructor accepts only the exact native-captured launcher URL; this field validates that value and does not form the URL passed to the socket.",
        "contextOffset": 46146,
        "context": ";\n    Object.assign(this, {href: __launch.url, protocol: 'ws:', hostname: '127.0.0.1', port: __launch.port, username: '', password: '', search: '', hash: ''});\n  }\n};\nglobalThis.WebSoc",
        "contextSha256": "f3c257409ac2d99417d4a11494bf55e06b36e5a402a95a87d1fe4b2e691a2ed0"
      },
      {
        "offset": 92628,
        "rawLength": 7,
        "rawSha256": "2e7c91921cacfcad057970024e9b3d20d104e60427eede3dda5d84bbaf27e1d2",
        "host": "t.local",
        "id": "kestrel-jsc-macos13-arm64-92628",
        "revision": "ew.technical-occurrence.v1",
        "interpretation": "Minified Zod date parser reads the local boolean property of its options object to construct a date-validation regular expression. This identifier is not a hostname literal or connection selector.",
        "contextOffset": 92553,
        "context": "Exp(`^${Aa(t)}$`)}function Ca(t){let e=`${Ia}T${Aa(t)}`,r=[];return r.push(t.local?\"Z?\":\"Z\"),t.offset&&r.push(\"([+-]\\\\d{2}:?\\\\d{2})\"),e=`${e}(${r.join(\"|\")})`,new RegExp(`^${e}$`)}fu",
        "contextSha256": "5ad82d5e84f46b28d26a12f96b60a0c5decef2a322848799c29ab7c411dee608"
      },
      {
        "offset": 148113,
        "rawLength": 9,
        "rawSha256": "12ca17b49af2289436f303e0166030a21e525d266e209267433801a8fd4071a0",
        "host": "127.0.0.1",
        "id": "kestrel-jsc-macos13-arm64-148113",
        "revision": "ew.technical-occurrence.v1",
        "interpretation": "SDK comparison rejects a parsed address whose hostname differs from loopback. The socket receives the separately parsed original address.href, never this literal.",
        "contextOffset": 148038,
        "context": "rror(\"invalid loopback address\"))}return s.protocol!==\"ws:\"||s.hostname!==\"127.0.0.1\"||!s.port||s.username||s.password||s.search||s.hash?Promise.reject(new Error(\"expected a loopback W",
        "contextSha256": "f6988aec95334bec3fa6cb77617a29feb50a0872e6d436657d9c8ef426e4ee9a"
      },
      {
        "offset": 269882,
        "rawLength": 7,
        "rawSha256": "2e7c91921cacfcad057970024e9b3d20d104e60427eede3dda5d84bbaf27e1d2",
        "host": "t.local",
        "id": "kestrel-jsc-macos13-arm64-269882",
        "revision": "ew.technical-occurrence.v1",
        "interpretation": "Minified Zod date parser reads the local boolean property of its options object to construct a date-validation regular expression. This identifier is not a hostname literal or connection selector.",
        "contextOffset": 269807,
        "context": "Exp(`^${Hl(t)}$`)}function Xl(t){let e=`${Wl}T${Hl(t)}`,r=[];return r.push(t.local?\"Z?\":\"Z\"),t.offset&&r.push(\"([+-]\\\\d{2}:?\\\\d{2})\"),e=`${e}(${r.join(\"|\")})`,new RegExp(`^${e}$`)}fu",
        "contextSha256": "7631f80ce7787a1d7cd382204eef2f40e03c24131d12c9360b1801a9aeefd7cd"
      }
    ]
  },
{
  "artifactSha256": "90f3c135f821a6ece0085c3cf3cf76925c96af0bbc229d661d5b33584265cf66",
  "artifactSize": 452368,
  "target": "macos-arm64",
  "path": "build/macos-arm64/run",
  "embedded": {
    "offset": 60256,
    "size": 283932,
    "sha256": "82e30dabdb5eee4715298c7587eedde060ddf4fccbc23465e0203f364c057545"
  },
  "occurrences": [
    {
      "offset": 61253,
      "rawLength": 9,
      "rawSha256": "12ca17b49af2289436f303e0166030a21e525d266e209267433801a8fd4071a0",
      "host": "127.0.0.1",
      "id": "kestrel-window-1-macos13-arm64-61253",
      "revision": "ew.technical-occurrence.v1",
      "interpretation": "URL shim reflective hostname. Constructor accepts only the exact native-captured launcher URL; this field validates that value and does not form the URL passed to the socket.",
      "contextOffset": 61178,
      "context": ";\n    Object.assign(this, {href: __launch.url, protocol: 'ws:', hostname: '127.0.0.1', port: __launch.port, username: '', password: '', search: '', hash: ''});\n  }\n};\nglobalThis.WebSoc",
      "contextSha256": "f3c257409ac2d99417d4a11494bf55e06b36e5a402a95a87d1fe4b2e691a2ed0"
    },
    {
      "offset": 107673,
      "rawLength": 7,
      "rawSha256": "2e7c91921cacfcad057970024e9b3d20d104e60427eede3dda5d84bbaf27e1d2",
      "host": "t.local",
      "id": "kestrel-window-1-macos13-arm64-107673",
      "revision": "ew.technical-occurrence.v1",
      "interpretation": "Minified Zod date parser reads the local boolean property of its options object to construct a date-validation regular expression. This identifier is not a hostname literal or connection selector.",
      "contextOffset": 107598,
      "context": "Exp(`^${Aa(t)}$`)}function Ca(t){let e=`${Ia}T${Aa(t)}`,r=[];return r.push(t.local?\"Z?\":\"Z\"),t.offset&&r.push(\"([+-]\\\\d{2}:?\\\\d{2})\"),e=`${e}(${r.join(\"|\")})`,new RegExp(`^${e}$`)}fu",
      "contextSha256": "5ad82d5e84f46b28d26a12f96b60a0c5decef2a322848799c29ab7c411dee608"
    },
    {
      "offset": 163158,
      "rawLength": 9,
      "rawSha256": "12ca17b49af2289436f303e0166030a21e525d266e209267433801a8fd4071a0",
      "host": "127.0.0.1",
      "id": "kestrel-window-1-macos13-arm64-163158",
      "revision": "ew.technical-occurrence.v1",
      "interpretation": "SDK comparison rejects a parsed address whose hostname differs from loopback. The socket receives the separately parsed original address.href, never this literal.",
      "contextOffset": 163083,
      "context": "rror(\"invalid loopback address\"))}return s.protocol!==\"ws:\"||s.hostname!==\"127.0.0.1\"||!s.port||s.username||s.password||s.search||s.hash?Promise.reject(new Error(\"expected a loopback W",
      "contextSha256": "f6988aec95334bec3fa6cb77617a29feb50a0872e6d436657d9c8ef426e4ee9a"
    },
    {
      "offset": 284927,
      "rawLength": 7,
      "rawSha256": "2e7c91921cacfcad057970024e9b3d20d104e60427eede3dda5d84bbaf27e1d2",
      "host": "t.local",
      "id": "kestrel-window-1-macos13-arm64-284927",
      "revision": "ew.technical-occurrence.v1",
      "interpretation": "Minified Zod date parser reads the local boolean property of its options object to construct a date-validation regular expression. This identifier is not a hostname literal or connection selector.",
      "contextOffset": 284852,
      "context": "Exp(`^${Hl(t)}$`)}function Xl(t){let e=`${Wl}T${Hl(t)}`,r=[];return r.push(t.local?\"Z?\":\"Z\"),t.offset&&r.push(\"([+-]\\\\d{2}:?\\\\d{2})\"),e=`${e}(${r.join(\"|\")})`,new RegExp(`^${e}$`)}fu",
      "contextSha256": "7631f80ce7787a1d7cd382204eef2f40e03c24131d12c9360b1801a9aeefd7cd"
    }
  ]
},
{
  "artifactSha256": "6ff281f32f577fea05142c1a960279c57b2a63a18d43f9bea9c79f79e18fd4e7",
  "artifactSize": 452368,
  "target": "macos-arm64",
  "path": "build/macos-arm64/run",
  "embedded": {
    "offset": 60256,
    "size": 283932,
    "sha256": "ecfbbf255701648fd775818de01c33bc712a5d9e1350cc4d82ea997803164d3b"
  },
  "occurrences": [
    {
      "offset": 61253,
      "rawLength": 9,
      "rawSha256": "12ca17b49af2289436f303e0166030a21e525d266e209267433801a8fd4071a0",
      "host": "127.0.0.1",
      "id": "kestrel-window-2-macos13-arm64-61253",
      "revision": "ew.technical-occurrence.v1",
      "interpretation": "URL shim reflective hostname. Constructor accepts only the exact native-captured launcher URL; this field validates that value and does not form the URL passed to the socket.",
      "contextOffset": 61178,
      "context": ";\n    Object.assign(this, {href: __launch.url, protocol: 'ws:', hostname: '127.0.0.1', port: __launch.port, username: '', password: '', search: '', hash: ''});\n  }\n};\nglobalThis.WebSoc",
      "contextSha256": "f3c257409ac2d99417d4a11494bf55e06b36e5a402a95a87d1fe4b2e691a2ed0"
    },
    {
      "offset": 107673,
      "rawLength": 7,
      "rawSha256": "2e7c91921cacfcad057970024e9b3d20d104e60427eede3dda5d84bbaf27e1d2",
      "host": "t.local",
      "id": "kestrel-window-2-macos13-arm64-107673",
      "revision": "ew.technical-occurrence.v1",
      "interpretation": "Minified Zod date parser reads the local boolean property of its options object to construct a date-validation regular expression. This identifier is not a hostname literal or connection selector.",
      "contextOffset": 107598,
      "context": "Exp(`^${Aa(t)}$`)}function Ca(t){let e=`${Ia}T${Aa(t)}`,r=[];return r.push(t.local?\"Z?\":\"Z\"),t.offset&&r.push(\"([+-]\\\\d{2}:?\\\\d{2})\"),e=`${e}(${r.join(\"|\")})`,new RegExp(`^${e}$`)}fu",
      "contextSha256": "5ad82d5e84f46b28d26a12f96b60a0c5decef2a322848799c29ab7c411dee608"
    },
    {
      "offset": 163158,
      "rawLength": 9,
      "rawSha256": "12ca17b49af2289436f303e0166030a21e525d266e209267433801a8fd4071a0",
      "host": "127.0.0.1",
      "id": "kestrel-window-2-macos13-arm64-163158",
      "revision": "ew.technical-occurrence.v1",
      "interpretation": "SDK comparison rejects a parsed address whose hostname differs from loopback. The socket receives the separately parsed original address.href, never this literal.",
      "contextOffset": 163083,
      "context": "rror(\"invalid loopback address\"))}return s.protocol!==\"ws:\"||s.hostname!==\"127.0.0.1\"||!s.port||s.username||s.password||s.search||s.hash?Promise.reject(new Error(\"expected a loopback W",
      "contextSha256": "f6988aec95334bec3fa6cb77617a29feb50a0872e6d436657d9c8ef426e4ee9a"
    },
    {
      "offset": 284927,
      "rawLength": 7,
      "rawSha256": "2e7c91921cacfcad057970024e9b3d20d104e60427eede3dda5d84bbaf27e1d2",
      "host": "t.local",
      "id": "kestrel-window-2-macos13-arm64-284927",
      "revision": "ew.technical-occurrence.v1",
      "interpretation": "Minified Zod date parser reads the local boolean property of its options object to construct a date-validation regular expression. This identifier is not a hostname literal or connection selector.",
      "contextOffset": 284852,
      "context": "Exp(`^${Hl(t)}$`)}function Xl(t){let e=`${Wl}T${Hl(t)}`,r=[];return r.push(t.local?\"Z?\":\"Z\"),t.offset&&r.push(\"([+-]\\\\d{2}:?\\\\d{2})\"),e=`${e}(${r.join(\"|\")})`,new RegExp(`^${e}$`)}fu",
      "contextSha256": "7631f80ce7787a1d7cd382204eef2f40e03c24131d12c9360b1801a9aeefd7cd"
    }
  ]
},
{
  "artifactSha256": "90f3c135f821a6ece0085c3cf3cf76925c96af0bbc229d661d5b33584265cf66",
  "artifactSize": 452368,
  "target": "macos-arm64",
  "path": "build/macos-arm64/KestrelYards.app/Contents/MacOS/KestrelYards",
  "embedded": {
    "offset": 60256,
    "size": 283932,
    "sha256": "82e30dabdb5eee4715298c7587eedde060ddf4fccbc23465e0203f364c057545"
  },
  "occurrences": [
    {
      "offset": 61253,
      "rawLength": 9,
      "rawSha256": "12ca17b49af2289436f303e0166030a21e525d266e209267433801a8fd4071a0",
      "host": "127.0.0.1",
      "id": "kestrel-window-1-macos13-arm64-61253-bundle",
      "revision": "ew.technical-occurrence.v1",
      "interpretation": "URL shim reflective hostname. Constructor accepts only the exact native-captured launcher URL; this field validates that value and does not form the URL passed to the socket.",
      "contextOffset": 61178,
      "context": ";\n    Object.assign(this, {href: __launch.url, protocol: 'ws:', hostname: '127.0.0.1', port: __launch.port, username: '', password: '', search: '', hash: ''});\n  }\n};\nglobalThis.WebSoc",
      "contextSha256": "f3c257409ac2d99417d4a11494bf55e06b36e5a402a95a87d1fe4b2e691a2ed0"
    },
    {
      "offset": 107673,
      "rawLength": 7,
      "rawSha256": "2e7c91921cacfcad057970024e9b3d20d104e60427eede3dda5d84bbaf27e1d2",
      "host": "t.local",
      "id": "kestrel-window-1-macos13-arm64-107673-bundle",
      "revision": "ew.technical-occurrence.v1",
      "interpretation": "Minified Zod date parser reads the local boolean property of its options object to construct a date-validation regular expression. This identifier is not a hostname literal or connection selector.",
      "contextOffset": 107598,
      "context": "Exp(`^${Aa(t)}$`)}function Ca(t){let e=`${Ia}T${Aa(t)}`,r=[];return r.push(t.local?\"Z?\":\"Z\"),t.offset&&r.push(\"([+-]\\\\d{2}:?\\\\d{2})\"),e=`${e}(${r.join(\"|\")})`,new RegExp(`^${e}$`)}fu",
      "contextSha256": "5ad82d5e84f46b28d26a12f96b60a0c5decef2a322848799c29ab7c411dee608"
    },
    {
      "offset": 163158,
      "rawLength": 9,
      "rawSha256": "12ca17b49af2289436f303e0166030a21e525d266e209267433801a8fd4071a0",
      "host": "127.0.0.1",
      "id": "kestrel-window-1-macos13-arm64-163158-bundle",
      "revision": "ew.technical-occurrence.v1",
      "interpretation": "SDK comparison rejects a parsed address whose hostname differs from loopback. The socket receives the separately parsed original address.href, never this literal.",
      "contextOffset": 163083,
      "context": "rror(\"invalid loopback address\"))}return s.protocol!==\"ws:\"||s.hostname!==\"127.0.0.1\"||!s.port||s.username||s.password||s.search||s.hash?Promise.reject(new Error(\"expected a loopback W",
      "contextSha256": "f6988aec95334bec3fa6cb77617a29feb50a0872e6d436657d9c8ef426e4ee9a"
    },
    {
      "offset": 284927,
      "rawLength": 7,
      "rawSha256": "2e7c91921cacfcad057970024e9b3d20d104e60427eede3dda5d84bbaf27e1d2",
      "host": "t.local",
      "id": "kestrel-window-1-macos13-arm64-284927-bundle",
      "revision": "ew.technical-occurrence.v1",
      "interpretation": "Minified Zod date parser reads the local boolean property of its options object to construct a date-validation regular expression. This identifier is not a hostname literal or connection selector.",
      "contextOffset": 284852,
      "context": "Exp(`^${Hl(t)}$`)}function Xl(t){let e=`${Wl}T${Hl(t)}`,r=[];return r.push(t.local?\"Z?\":\"Z\"),t.offset&&r.push(\"([+-]\\\\d{2}:?\\\\d{2})\"),e=`${e}(${r.join(\"|\")})`,new RegExp(`^${e}$`)}fu",
      "contextSha256": "7631f80ce7787a1d7cd382204eef2f40e03c24131d12c9360b1801a9aeefd7cd"
    }
  ]
},
{
  "artifactSha256": "6ff281f32f577fea05142c1a960279c57b2a63a18d43f9bea9c79f79e18fd4e7",
  "artifactSize": 452368,
  "target": "macos-arm64",
  "path": "build/macos-arm64/KestrelYards.app/Contents/MacOS/KestrelYards",
  "embedded": {
    "offset": 60256,
    "size": 283932,
    "sha256": "ecfbbf255701648fd775818de01c33bc712a5d9e1350cc4d82ea997803164d3b"
  },
  "occurrences": [
    {
      "offset": 61253,
      "rawLength": 9,
      "rawSha256": "12ca17b49af2289436f303e0166030a21e525d266e209267433801a8fd4071a0",
      "host": "127.0.0.1",
      "id": "kestrel-window-2-macos13-arm64-61253-bundle",
      "revision": "ew.technical-occurrence.v1",
      "interpretation": "URL shim reflective hostname. Constructor accepts only the exact native-captured launcher URL; this field validates that value and does not form the URL passed to the socket.",
      "contextOffset": 61178,
      "context": ";\n    Object.assign(this, {href: __launch.url, protocol: 'ws:', hostname: '127.0.0.1', port: __launch.port, username: '', password: '', search: '', hash: ''});\n  }\n};\nglobalThis.WebSoc",
      "contextSha256": "f3c257409ac2d99417d4a11494bf55e06b36e5a402a95a87d1fe4b2e691a2ed0"
    },
    {
      "offset": 107673,
      "rawLength": 7,
      "rawSha256": "2e7c91921cacfcad057970024e9b3d20d104e60427eede3dda5d84bbaf27e1d2",
      "host": "t.local",
      "id": "kestrel-window-2-macos13-arm64-107673-bundle",
      "revision": "ew.technical-occurrence.v1",
      "interpretation": "Minified Zod date parser reads the local boolean property of its options object to construct a date-validation regular expression. This identifier is not a hostname literal or connection selector.",
      "contextOffset": 107598,
      "context": "Exp(`^${Aa(t)}$`)}function Ca(t){let e=`${Ia}T${Aa(t)}`,r=[];return r.push(t.local?\"Z?\":\"Z\"),t.offset&&r.push(\"([+-]\\\\d{2}:?\\\\d{2})\"),e=`${e}(${r.join(\"|\")})`,new RegExp(`^${e}$`)}fu",
      "contextSha256": "5ad82d5e84f46b28d26a12f96b60a0c5decef2a322848799c29ab7c411dee608"
    },
    {
      "offset": 163158,
      "rawLength": 9,
      "rawSha256": "12ca17b49af2289436f303e0166030a21e525d266e209267433801a8fd4071a0",
      "host": "127.0.0.1",
      "id": "kestrel-window-2-macos13-arm64-163158-bundle",
      "revision": "ew.technical-occurrence.v1",
      "interpretation": "SDK comparison rejects a parsed address whose hostname differs from loopback. The socket receives the separately parsed original address.href, never this literal.",
      "contextOffset": 163083,
      "context": "rror(\"invalid loopback address\"))}return s.protocol!==\"ws:\"||s.hostname!==\"127.0.0.1\"||!s.port||s.username||s.password||s.search||s.hash?Promise.reject(new Error(\"expected a loopback W",
      "contextSha256": "f6988aec95334bec3fa6cb77617a29feb50a0872e6d436657d9c8ef426e4ee9a"
    },
    {
      "offset": 284927,
      "rawLength": 7,
      "rawSha256": "2e7c91921cacfcad057970024e9b3d20d104e60427eede3dda5d84bbaf27e1d2",
      "host": "t.local",
      "id": "kestrel-window-2-macos13-arm64-284927-bundle",
      "revision": "ew.technical-occurrence.v1",
      "interpretation": "Minified Zod date parser reads the local boolean property of its options object to construct a date-validation regular expression. This identifier is not a hostname literal or connection selector.",
      "contextOffset": 284852,
      "context": "Exp(`^${Hl(t)}$`)}function Xl(t){let e=`${Wl}T${Hl(t)}`,r=[];return r.push(t.local?\"Z?\":\"Z\"),t.offset&&r.push(\"([+-]\\\\d{2}:?\\\\d{2})\"),e=`${e}(${r.join(\"|\")})`,new RegExp(`^${e}$`)}fu",
      "contextSha256": "7631f80ce7787a1d7cd382204eef2f40e03c24131d12c9360b1801a9aeefd7cd"
    }
  ]
},
{
  "artifactSha256": "772425b6046a29e4a6cb3b3e282f708841ef3fe4fb456f06820c9084c82d3a33",
  "artifactSize": 517056,
  "target": "macos-arm64",
  "path": "build/macos-arm64/KestrelYards.app/Contents/MacOS/KestrelYards",
  "embedded": {
    "offset": 78900,
    "size": 284027,
    "sha256": "9655237464f000965a12b8a349b6876acfddd2e0c375c62a61550d6d4dba5da0"
  },
  "occurrences": [
    {
      "offset": 79897,
      "rawLength": 9,
      "rawSha256": "12ca17b49af2289436f303e0166030a21e525d266e209267433801a8fd4071a0",
      "host": "127.0.0.1",
      "id": "kestrel-window-display-1.0.2-macos13-arm64-79897",
      "revision": "ew.technical-occurrence.v1",
      "interpretation": "URL shim reflective hostname. Constructor accepts only the exact native-captured launcher URL; this field validates that value and does not form the URL passed to the socket.",
      "contextOffset": 79822,
      "context": ";\n    Object.assign(this, {href: __launch.url, protocol: 'ws:', hostname: '127.0.0.1', port: __launch.port, username: '', password: '', search: '', hash: ''});",
      "contextSha256": "071731a72e0f4f4682e9871f606092a14c3af67566e77ffc2288dbd662e4c046"
    },
    {
      "offset": 126317,
      "rawLength": 7,
      "rawSha256": "2e7c91921cacfcad057970024e9b3d20d104e60427eede3dda5d84bbaf27e1d2",
      "host": "t.local",
      "id": "kestrel-window-display-1.0.2-macos13-arm64-126317",
      "revision": "ew.technical-occurrence.v1",
      "interpretation": "Minified Zod date parser reads the local boolean property of its options object to construct a date-validation regular expression. This identifier is not a hostname literal or connection selector.",
      "contextOffset": 126242,
      "context": "Exp(`^${Aa(t)}$`)}function Ca(t){let e=`${Ia}T${Aa(t)}`,r=[];return r.push(t.local?\"Z?\":\"Z\"),t.offset&&r.push(\"([+-]\\\\d{2}:?\\\\d{2})\"),e=`${e}(${r.join(\"|\")})",
      "contextSha256": "1e396bd604d07901ae0b1adb9fe59a966a825c4c9db5f9817763780d23b1662d"
    },
    {
      "offset": 181802,
      "rawLength": 9,
      "rawSha256": "12ca17b49af2289436f303e0166030a21e525d266e209267433801a8fd4071a0",
      "host": "127.0.0.1",
      "id": "kestrel-window-display-1.0.2-macos13-arm64-181802",
      "revision": "ew.technical-occurrence.v1",
      "interpretation": "SDK comparison rejects a parsed address whose hostname differs from loopback. The socket receives the separately parsed original address.href, never this literal.",
      "contextOffset": 181727,
      "context": "rror(\"invalid loopback address\"))}return s.protocol!==\"ws:\"||s.hostname!==\"127.0.0.1\"||!s.port||s.username||s.password||s.search||s.hash?Promise.reject(new Err",
      "contextSha256": "380f6f7576a4b22f61fb461b4a1e77940bb6d9194a0921a229873ac5fcaffc2b"
    },
    {
      "offset": 303571,
      "rawLength": 7,
      "rawSha256": "2e7c91921cacfcad057970024e9b3d20d104e60427eede3dda5d84bbaf27e1d2",
      "host": "t.local",
      "id": "kestrel-window-display-1.0.2-macos13-arm64-303571",
      "revision": "ew.technical-occurrence.v1",
      "interpretation": "Minified Zod date parser reads the local boolean property of its options object to construct a date-validation regular expression. This identifier is not a hostname literal or connection selector.",
      "contextOffset": 303496,
      "context": "Exp(`^${Hl(t)}$`)}function Xl(t){let e=`${Wl}T${Hl(t)}`,r=[];return r.push(t.local?\"Z?\":\"Z\"),t.offset&&r.push(\"([+-]\\\\d{2}:?\\\\d{2})\"),e=`${e}(${r.join(\"|\")})",
      "contextSha256": "558a018940045d049108b8bf8b386f0cdf6f45730ef805758d3f0448a5a0b4e2"
    }
  ]
},
{
  "artifactSha256": "ecdfcc9bae4e9c70967c6c4fa63b9f43afa3710793ff2aa3f8a546bd549d7f94",
  "artifactSize": 442992,
  "target": "server",
  "path": "build/server/run",
  "embedded": {
    "offset": 45224,
    "size": 311142,
    "sha256": "f4c8216495dba5f4de8b3fa7dc206f1dc26ec6ba12571f43ee14c5ce73b25543"
  },
  "occurrences": [
    {
      "offset": 46221,
      "rawLength": 9,
      "rawSha256": "12ca17b49af2289436f303e0166030a21e525d266e209267433801a8fd4071a0",
      "host": "127.0.0.1",
      "id": "kestrel-projection-macos13-arm64-46221",
      "revision": "ew.technical-occurrence.v1",
      "interpretation": "The URL shim fills a hostname field after checking the exact launcher URL. The native socket uses the captured URL.",
      "contextOffset": 46146,
      "context": ";\n    Object.assign(this, {href: __launch.url, protocol: 'ws:', hostname: '127.0.0.1', port: __launch.port, username: '', password: '', search: '', hash: ''});",
      "contextSha256": "071731a72e0f4f4682e9871f606092a14c3af67566e77ffc2288dbd662e4c046"
    },
    {
      "offset": 92628,
      "rawLength": 7,
      "rawSha256": "2e7c91921cacfcad057970024e9b3d20d104e60427eede3dda5d84bbaf27e1d2",
      "host": "t.local",
      "id": "kestrel-projection-macos13-arm64-92628",
      "revision": "ew.technical-occurrence.v1",
      "interpretation": "Minified Zod datetime validation reads the local option and uses it to choose a timezone pattern in a regular expression.",
      "contextOffset": 92553,
      "context": "Exp(`^${bi(t)}$`)}function wi(t){let e=`${yi}T${bi(t)}`,r=[];return r.push(t.local?\"Z?\":\"Z\"),t.offset&&r.push(\"([+-]\\\\d{2}:?\\\\d{2})\"),e=`${e}(${r.join(\"|\")})",
      "contextSha256": "594052009139fa3574bc4f9605b08d9c2ccd78a7d4cfef63dfb211998cc6d47c"
    },
    {
      "offset": 172125,
      "rawLength": 9,
      "rawSha256": "12ca17b49af2289436f303e0166030a21e525d266e209267433801a8fd4071a0",
      "host": "127.0.0.1",
      "id": "kestrel-projection-macos13-arm64-172125",
      "revision": "ew.technical-occurrence.v1",
      "interpretation": "The SDK compares the parsed hostname with loopback. The socket receives the separately validated original address.",
      "contextOffset": 172050,
      "context": "rror(\"invalid loopback address\"))}return s.protocol!==\"ws:\"||s.hostname!==\"127.0.0.1\"||!s.port||s.username||s.password||s.search||s.hash?Promise.reject(new Err",
      "contextSha256": "380f6f7576a4b22f61fb461b4a1e77940bb6d9194a0921a229873ac5fcaffc2b"
    },
    {
      "offset": 296910,
      "rawLength": 7,
      "rawSha256": "2e7c91921cacfcad057970024e9b3d20d104e60427eede3dda5d84bbaf27e1d2",
      "host": "t.local",
      "id": "kestrel-projection-macos13-arm64-296910",
      "revision": "ew.technical-occurrence.v1",
      "interpretation": "Minified Zod datetime validation reads the local option and uses it to choose a timezone pattern in a regular expression.",
      "contextOffset": 296835,
      "context": "Exp(`^${ed(t)}$`)}function td(t){let e=`${Qc}T${ed(t)}`,r=[];return r.push(t.local?\"Z?\":\"Z\"),t.offset&&r.push(\"([+-]\\\\d{2}:?\\\\d{2})\"),e=`${e}(${r.join(\"|\")})",
      "contextSha256": "514afe7380e3b68e820067d81a8a32c3a248d21cd344ac26df6e115ee97b5eea"
    }
  ]
}
] as const;

export function reviewedOccurrence(artifactSha256: string, artifactSize: number, target: string, path: string, finding: {offset: number; rawLength: number; rawSha256: string; host: string | null}) {
 const artifact = reviewedMetadata.find(row => row.artifactSha256 === artifactSha256 && row.artifactSize === artifactSize && row.target === target && row.path === path);
 return artifact?.occurrences.find(row => row.offset === finding.offset && row.rawLength === finding.rawLength && row.rawSha256 === finding.rawSha256 && row.host === finding.host);
}
