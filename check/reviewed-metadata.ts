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
  }
] as const;

export function reviewedOccurrence(artifactSha256: string, artifactSize: number, target: string, path: string, finding: {offset: number; rawLength: number; rawSha256: string; host: string | null}) {
 const artifact = reviewedMetadata.find(row => row.artifactSha256 === artifactSha256 && row.artifactSize === artifactSize && row.target === target && row.path === path);
 return artifact?.occurrences.find(row => row.offset === finding.offset && row.rawLength === finding.rawLength && row.rawSha256 === finding.rawSha256 && row.host === finding.host);
}
