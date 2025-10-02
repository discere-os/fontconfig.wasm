/*
 * Emscripten compatibility layer for fontconfig
 * Provides fallback implementations for glibc-specific functions not available in musl
 */

#ifndef EMSCRIPTEN_COMPAT_H
#define EMSCRIPTEN_COMPAT_H

#ifdef __EMSCRIPTEN__

#include <stdlib.h>
#include <time.h>
#include <string.h>

/*
 * glibc random_r family is not available in musl/Emscripten
 * Provide simple fallback implementations
 */
#ifdef HAVE_RANDOM_R
#undef HAVE_RANDOM_R
#endif
#define HAVE_RANDOM_R 0

#ifndef HAVE_GETPROGNAME
#define HAVE_GETPROGNAME 0
#endif

/* Fallback implementation for getprogname (BSD/glibc extension) */
static inline const char* getprogname(void) {
    return "fontconfig";  /* Simple fallback */
}

/* Simple random_data structure for compatibility */
struct random_data {
    int32_t *fptr;
    int32_t *rptr;
    int32_t *state;
    int rand_type;
    int rand_deg;
    int rand_sep;
    int32_t *end_ptr;
};

/* Fallback implementation for initstate_r */
static inline int initstate_r(unsigned int seed, char *statebuf, size_t statelen, struct random_data *buf) {
    /* Simple fallback - just initialize standard rand() */
    srand(seed);
    buf->state = (int32_t*)statebuf;
    return 0;
}

/* Fallback implementation for random_r */
static inline int random_r(struct random_data *buf, int32_t *result) {
    /* Simple fallback using standard rand() */
    *result = rand();
    return 0;
}

#endif /* __EMSCRIPTEN__ */

#endif /* EMSCRIPTEN_COMPAT_H */