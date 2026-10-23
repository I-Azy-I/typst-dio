#import "../inflate.typ": inflate, base64-decode, url-decode
#let got = str(bytes(url-decode(inflate(base64-decode(read("inflate-test.b64"))))))
#let want = read("inflate-test.xml")
#assert(got == want, message: "MISMATCH")
OK #got.len() chars round-tripped
