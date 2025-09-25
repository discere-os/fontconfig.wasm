#include <emscripten.h>
#include <fontconfig/fontconfig.h>
#include <stdio.h>

EMSCRIPTEN_KEEPALIVE
const char* fontconfig_wasm_version(void) {
  static char buf[32];
  int v = FcGetVersion();
  snprintf(buf, sizeof(buf), "%d.%d.%d", (v/10000)%100, (v/100)%100, v%100);
  return buf;
}

