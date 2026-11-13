/* Same finite launcher channel as the Mac bridge. No resolver, proxy or guest filesystem API. */
#ifndef EW_PORTABLE_CHANNEL_H
#define EW_PORTABLE_CHANNEL_H
#include <stddef.h>
#include <stdint.h>
#define EW_FRAME_BYTES (4u * 1024u * 1024u)
typedef struct EWChannel EWChannel;
typedef void (*EWEvent)(void *, const char *, const uint8_t *, size_t);
uint64_t ew_millis(void);
int ew_launcher_url(const char *, unsigned *, const char **);
int ew_valid_utf8(const uint8_t *, size_t);
EWChannel *ew_channel_new(void);
int ew_channel_open(EWChannel *, const char *);
int ew_channel_send(EWChannel *, const uint8_t *, size_t);
int ew_channel_poll(EWChannel *, unsigned, EWEvent, void *);
void ew_channel_finish(EWChannel *);
void ew_channel_close(EWChannel *);
void ew_channel_free(EWChannel *);
#endif
