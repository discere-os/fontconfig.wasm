fc_wasm_cargs = ['-msimd128', '-DFC_WASM=1']

fc_main_link_args = [
  '-sWASM=1',
  '-sMODULARIZE=1',
  '-sEXPORT_ES6=1',
  '-sEXPORT_NAME=FontconfigModule',
  '-sALLOW_MEMORY_GROWTH=1',
  '-sENVIRONMENT=web,webview,worker',
  '-sNO_FILESYSTEM=1',
  '-sEXPORTED_RUNTIME_METHODS=["cwrap","ccall","UTF8ToString"]',
  '-O3',
  '-flto',
]

executable(
  'fontconfig-main',
  files('fontconfig_wasm_module.c'),
  dependencies: [fontconfig_dep],
  c_args: fc_wasm_cargs,
  link_args: fc_main_link_args,
  install: true,
  install_dir: get_option('bindir'),
)

fc_side_link_args = [
  '-sSIDE_MODULE=2',
  '-fPIC',
  '-O3',
  '-flto',
  '-sEXPORTED_FUNCTIONS=["_fontconfig_wasm_version"]',
]

shared_module(
  'fontconfig-side',
  files('fontconfig_wasm_side.c'),
  dependencies: [fontconfig_dep],
  name_prefix: '',
  c_args: fc_wasm_cargs,
  link_args: fc_side_link_args,
  install: true,
  install_dir: get_option('libdir'),
)

