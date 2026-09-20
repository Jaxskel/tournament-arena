/* Tournament Arena browser transport. GPL-2.0-or-later.
 * Each WebSocket binary message is one unmodified Quake datagram.
 * The gateway, never the browser, chooses the UDP destination.
 */
#include "../client/client.h"
#include <emscripten.h>
#include <arpa/inet.h>

EM_JS(void, arena_send, (const byte *data, int length), {
  if (Module.arenaTransport) Module.arenaTransport.send(HEAPU8.slice(data, data + length));
});
EM_JS(int, arena_receive, (byte *data, int capacity), {
  const q = Module.arenaTransport && Module.arenaTransport.queue;
  if (!q || !q.length) return 0;
  const packet = q.shift();
  if (packet.length > capacity) return 0;
  HEAPU8.set(packet, data); return packet.length;
});

static netadr_t arena_server(void) {
  netadr_t a; memset(&a, 0, sizeof(a)); a.type = NA_IP;
  a.ip[0] = 10; a.ip[3] = 1; a.port = htons(27960); return a;
}
qboolean Sys_StringToAdr(const char *s, netadr_t *a, netadrtype_t family) {
  if (strcmp(s, "10.0.0.1")) return qfalse;
  *a = arena_server(); return qtrue;
}
qboolean NET_CompareBaseAdrMask(netadr_t a, netadr_t b, int mask) {
  if (a.type != b.type) return qfalse;
  if (a.type == NA_LOOPBACK) return qtrue;
  if (a.type != NA_IP) return qfalse;
  if (mask < 0 || mask > 32) mask = 32;
  for (int i = 0; i < 4 && mask > 0; i++, mask -= 8) {
    int bits = mask >= 8 ? 255 : (255 << (8-mask)) & 255;
    if ((a.ip[i]&bits) != (b.ip[i]&bits)) return qfalse;
  }
  return qtrue;
}
qboolean NET_CompareBaseAdr(netadr_t a, netadr_t b) { return NET_CompareBaseAdrMask(a,b,-1); }
qboolean NET_CompareAdr(netadr_t a, netadr_t b) { return NET_CompareBaseAdr(a,b) && (a.type == NA_LOOPBACK || a.port == b.port); }
qboolean NET_IsLocalAddress(netadr_t a) { return a.type == NA_LOOPBACK; }
qboolean Sys_IsLANAddress(netadr_t a) { return NET_IsLocalAddress(a); }
const char *NET_AdrToString(netadr_t a) { return a.type == NA_LOOPBACK ? "loopback" : "10.0.0.1"; }
const char *NET_AdrToStringwPort(netadr_t a) { return a.type == NA_LOOPBACK ? "loopback" : "10.0.0.1:27960"; }
void Sys_SendPacket(int length, const void *data, netadr_t to) {
  if (to.type == NA_IP && length > 0 && length <= MAX_MSGLEN) arena_send(data,length);
}
void NET_Sleep(int msec) {
  byte data[MAX_MSGLEN]; msg_t msg; netadr_t from = arena_server();
  int length, count = 0;
  while (count++ < 128 && (length = arena_receive(data,sizeof(data))) > 0) {
    MSG_Init(&msg, data, sizeof(data)); msg.cursize = length;
    CL_PacketEvent(from,&msg);
  }
}
void NET_Init(void) { Cvar_Get("net_enabled","1",0); }
void NET_Shutdown(void) {}
void NET_Config(qboolean enabled) {}
void NET_Restart_f(void) {}
void NET_JoinMulticast6(void) {}
void NET_LeaveMulticast6(void) {}
void Sys_ShowIP(void) { Com_Printf("Tournament WebSocket gateway\n"); }

EMSCRIPTEN_KEEPALIVE void Arena_Command(const char *command) { Cbuf_AddText(command); Cbuf_AddText("\n"); }
EMSCRIPTEN_KEEPALIVE int Arena_State(void) { return clc.state; }
EMSCRIPTEN_KEEPALIVE int Arena_ServerTime(void) { return cl.snap.serverTime; }
EMSCRIPTEN_KEEPALIVE int Arena_Ping(void) { return cl.snap.ping; }
EMSCRIPTEN_KEEPALIVE int Arena_FrameCount(void) { return cls.framecount; }
EMSCRIPTEN_KEEPALIVE int Arena_Health(void) { return cl.snap.ps.stats[STAT_HEALTH]; }
EMSCRIPTEN_KEEPALIVE int Arena_Score(void) { return cl.snap.ps.persistant[PERS_SCORE]; }
EMSCRIPTEN_KEEPALIVE float Arena_X(void) { return cl.snap.ps.origin[0]; }
EMSCRIPTEN_KEEPALIVE float Arena_Y(void) { return cl.snap.ps.origin[1]; }
EMSCRIPTEN_KEEPALIVE float Arena_Z(void) { return cl.snap.ps.origin[2]; }

/* The embedding shell owns Escape and menus. Native Escape handling can set
 * KEYCATCH_UI even when ESCAPE is unbound, so explicitly release that catcher. */
EMSCRIPTEN_KEEPALIVE void Arena_Resume(void) {
  Key_ClearStates(); Key_SetCatcher(0); Cvar_Set("cl_paused","0");
}
EMSCRIPTEN_KEEPALIVE void Arena_ReleaseInput(void) { Key_ClearStates(); }
EMSCRIPTEN_KEEPALIVE int Arena_KeyCatcher(void) { return Key_GetCatcher(); }
EMSCRIPTEN_KEEPALIVE int Arena_ClientNum(void) { return cl.snap.ps.clientNum; }
EMSCRIPTEN_KEEPALIVE float Arena_Yaw(void) { return cl.snap.ps.viewangles[YAW]; }
EMSCRIPTEN_KEEPALIVE float Arena_Pitch(void) { return cl.snap.ps.viewangles[PITCH]; }
EMSCRIPTEN_KEEPALIVE const char *Arena_Map(void) {
  return Info_ValueForKey(cl.gameState.stringData+cl.gameState.stringOffsets[CS_SERVERINFO],"mapname");
}
EMSCRIPTEN_KEEPALIVE const char *Arena_PlayerInfo(int index) {
  if(index<0 || index>=MAX_CLIENTS) return "";
  return cl.gameState.stringData+cl.gameState.stringOffsets[CS_PLAYERS+index];
}
EMSCRIPTEN_KEEPALIVE const char *Arena_Entities(void) {
  static char json[16384]; int used=0;
  used=snprintf(json,sizeof(json),"[");
  for(int i=0;i<cl.snap.numEntities;i++) {
    entityState_t *e=&cl.parseEntities[(cl.snap.parseEntitiesNum+i)&(MAX_PARSE_ENTITIES-1)];
    if(e->eType!=ET_PLAYER || e->number==cl.snap.ps.clientNum)continue;
    used+=snprintf(json+used,sizeof(json)-used,"%s{\"id\":%d,\"x\":%.2f,\"y\":%.2f,\"z\":%.2f}",used>1?",":"",e->clientNum,e->pos.trBase[0],e->pos.trBase[1],e->pos.trBase[2]);
    if(used>(int)sizeof(json)-256)break;
  }
  snprintf(json+used,sizeof(json)-used,"]");return json;
}

EMSCRIPTEN_KEEPALIVE int Arena_Intermission(void) { return cl.snap.ps.pm_type == PM_INTERMISSION; }
