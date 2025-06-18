dependencies = [libintl_dep]

if get_option('freetype').enabled()
dependencies += [freetype_dep]
endif

fcquery = executable('fc-query', ['fc-query.c', fcstdint_h, alias_headers, ft_alias_headers],
  include_directories: [incbase, incsrc],
  dependencies: dependencies,
  link_with: [libfontconfig],
  c_args: c_args,
  install: true,
  install_tag: 'tools')

tools_man_pages += ['fc-query']
