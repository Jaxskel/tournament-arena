#!/usr/bin/env python3
"""Apply our small, idempotent GPL engine changes to the pinned upstream."""
from pathlib import Path
import shutil, sys
root = Path(__file__).resolve().parents[1]
engine = Path(sys.argv[1])
p = engine/'code/qcommon/net_ip.c'
s = p.read_text()
if '#include "net_web.c"' not in s:
    p.write_text('#ifdef __EMSCRIPTEN__\n#include "net_web.c"\n#else\n'+s+'\n#endif\n')
shutil.copyfile(root/'patches/net_web.c', engine/'code/qcommon/net_web.c')
p = engine/'cmake/platforms/emscripten.cmake'
s = p.read_text().replace('-sTOTAL_MEMORY=256MB','-sINITIAL_MEMORY=256MB\n    -sALLOW_MEMORY_GROWTH=1\n    -sMAXIMUM_MEMORY=1GB')
if 'removeRunDependency,ccall' not in s:
    s = s.replace('-sEXPORTED_RUNTIME_METHODS=FS,addRunDependency,removeRunDependency','-sEXPORTED_RUNTIME_METHODS=FS,addRunDependency,removeRunDependency,ccall')
while ',ccall,ccall' in s: s=s.replace(',ccall,ccall',',ccall')
p.write_text(s)
# Native admission: the gateway creates one private registration file per UDP socket.
# Userinfo cannot supply or modify identity or spectator privileges.
p=engine/'code/server/sv_client.c';s=p.read_text()
if 'ArenaSessionInfo' not in s:
    helper=r'''
/* Tournament Arena trusted gateway admission. GPL-2.0-or-later. */
static qboolean ArenaSessionInfo(netadr_t from, char *userinfo) {
    const char *dir = getenv("ARENA_SESSION_DIR");
    char path[1024], name[32], id[80]; int watch; FILE *f;
    if (!dir || !*dir || from.type == NA_BOT) return qtrue;
    if (from.type != NA_IP || from.ip[0] != 127 || from.ip[3] != 1) return qfalse;
    Com_sprintf(path, sizeof(path), "%s/%u", dir, (unsigned)BigShort(from.port)&65535);
    f = fopen(path, "r"); if (!f) return qfalse;
    if (fscanf(f, "%d %31s %79s", &watch, name, id) != 3) { fclose(f); return qfalse; }
    fclose(f);
    Info_SetValueForKey(userinfo,"arena_watch",watch ? "1":"0");
    Info_SetValueForKey(userinfo,"arena_id",id);
    Info_SetValueForKey(userinfo,"name",name);
    Info_SetValueForKey(userinfo,"model","sarge");
    Info_SetValueForKey(userinfo,"headmodel","sarge");
    return qtrue;
}
'''
    s=s.replace('static void SV_CloseDownload',helper+'\nstatic void SV_CloseDownload',1)
    marker='Q_strncpyz( userinfo, Cmd_Argv(1), sizeof(userinfo) );'
    s=s.replace(marker,marker+'''\n\tif (!ArenaSessionInfo(from,userinfo)) { NET_OutOfBandPrint(NS_SERVER,from,"print\\nValid arena session required.\\n"); return; }''',1)
    marker='\t// name for C code'
    s=s.replace(marker,'''\tif (!ArenaSessionInfo(cl->netchan.remoteAddress,cl->userinfo)) { SV_DropClient(cl,"Arena session ended"); return; }\n'''+marker,1)
    # When all connections originate at the gateway, qport alone is not identity.
    s=s.replace('&& ( cl->netchan.qport == qport', '&& ( (!getenv("ARENA_SESSION_DIR") && cl->netchan.qport == qport)')
    p.write_text(s)
p=engine/'code/server/sv_main.c';s=p.read_text()
if 'Arena gateway sockets' not in s:
    s=s.replace('// it is possible to have multiple clients from a single IP','// Arena gateway sockets are stable and must never be reassigned by qport.\n\t\tif (getenv("ARENA_SESSION_DIR") && cl->netchan.remoteAddress.port != from.port) continue;\n\t\t// it is possible to have multiple clients from a single IP',1)
    p.write_text(s)
p=engine/'code/game/g_client.c';s=p.read_text()
if 'Arena spectator admission' not in s:
    marker='\tclient->pers.connected = CON_CONNECTED;'
    s=s.replace(marker,'''\t/* Arena spectator admission is set by the trusted native server. */
    { char arenaInfo[MAX_INFO_STRING]; trap_GetUserinfo(clientNum,arenaInfo,sizeof(arenaInfo));
      if (!Q_stricmp(Info_ValueForKey(arenaInfo,"arena_watch"),"1")) {
        client->sess.sessionTeam=TEAM_SPECTATOR;
        client->sess.spectatorState=SPECTATOR_FOLLOW;
        client->sess.spectatorClient=-1;
      }
    }
'''+marker,1)
    p.write_text(s)
p=engine/'code/game/g_cmds.c';s=p.read_text()
if 'Arena watchers cannot join' not in s:
    marker='\tclient = ent->client;'
    pos=s.index('void SetTeam(');i=s.index(marker,pos)
    s=s[:i]+'''    /* Arena watchers cannot join a playing team, even with a modified client. */
    { char arenaInfo[MAX_INFO_STRING]; trap_GetUserinfo(ent-g_entities,arenaInfo,sizeof(arenaInfo));
      if (!Q_stricmp(Info_ValueForKey(arenaInfo,"arena_watch"),"1")) s="spectator";
    }
'''+s[i:]
    p.write_text(s)
# Closing a browser revokes its native slot immediately instead of waiting for
# the ordinary UDP timeout. This also prevents rapid reconnects filling a room.
p=engine/'code/server/sv_main.c';s=p.read_text()
if 'Arena revoked session cleanup' not in s:
    marker='\t\t// message times may be wrong across a changelevel'
    s=s.replace(marker,'''        /* Arena revoked session cleanup. Gateway owns these files. */
        if (cl->state >= CS_CONNECTED && cl->netchan.remoteAddress.type == NA_IP) {
            const char *dir = getenv("ARENA_SESSION_DIR");
            if (dir && *dir) {
                char path[1024]; FILE *session;
                Com_sprintf(path,sizeof(path),"%s/%u",dir,(unsigned)BigShort(cl->netchan.remoteAddress.port)&65535);
                session=fopen(path,"r");
                if (!session) { SV_DropClient(cl,"Arena session ended"); cl->state=CS_FREE; continue; }
                fclose(session);
            }
        }
'''+marker,1)
    p.write_text(s)
# Report the real, server-supplied scoreboard to the Tournament frame UI.
p=engine/'code/cgame/cg_servercmds.c';s=p.read_text()
if 'ARENA_SCORES_BEGIN' not in s:
    marker='\tcgs.clientinfo[ cg.scores[i].client ].score = cg.scores[i].score;'
    s=s.replace('\tmemset( cg.scores, 0, sizeof( cg.scores ) );','\tCG_Printf("ARENA_SCORES_BEGIN\\n");\n\tmemset( cg.scores, 0, sizeof( cg.scores ) );',1)
    s=s.replace(marker,'\tCG_Printf("ARENA_SCORE %d %d %d\\n",cg.scores[i].client,cg.scores[i].score,cg.scores[i].ping);\n'+marker,1)
    pos=s.index('#ifdef MISSIONPACK',s.index('static void CG_ParseScores'))
    s=s[:pos]+'\tCG_Printf("ARENA_SCORES_END\\n");\n'+s[pos:]
    p.write_text(s)

# Tournament rounds advance without waiting for every player to click ready.
p=engine/'code/game/g_main.c';s=p.read_text()
if 'Arena automatic intermission' not in s:
    marker='\t// only test ready status when there are real players present'
    assert marker in s
    s=s.replace(marker,"""    /* Arena automatic intermission: ten seconds to view the final scores. */
    if (trap_Cvar_VariableIntegerValue("g_arenaAutoRotate") &&
        level.time >= level.intermissiontime + 10000) {
        ExitLevel();
        return;
    }
"""+marker,1)
    p.write_text(s)

# Both browser defaults and server admission settings exceed upstream's 32
# startup commands. Preserve the final connect/map commands and all bot slots.
p=engine/'code/qcommon/common.c';s=p.read_text()
s=s.replace('#define\tMAX_CONSOLE_LINES\t32','#define\tMAX_CONSOLE_LINES\t128')
p.write_text(s)

# Score telemetry belongs in the HTML board, not the in-game notification feed.
p=engine/'code/cgame/cg_servercmds.c';s=p.read_text().replace('CG_Printf("ARENA_', 'CG_Printf("[skipnotify]ARENA_');p.write_text(s)
p=engine/'code/cgame/cg_draw.c';s=p.read_text().replace('return CG_DrawOldScoreboard();','return qfalse; /* Tournament HTML scoreboard owns this surface. */');p.write_text(s)

# Keep the requested number of bots alongside human players. The gateway
# admits six humans and four spectators; native capacity is sixteen slots.
p=engine/'code/game/g_bot.c';s=p.read_text()
if 'Arena fixed bot population' not in s:
    marker='\ttrap_Cvar_Update(&bot_minplayers);'
    assert marker in s
    s=s.replace(marker,"""    /* Arena fixed bot population, independent of human or observer joins. */
    if (g_gametype.integer == GT_FFA) {
        int desiredBots = trap_Cvar_VariableIntegerValue("bot_arenaCount");
        if (desiredBots > 0) {
            if (desiredBots > 6) desiredBots = 6;
            botplayers = G_CountBotPlayers(TEAM_FREE);
            if (botplayers < desiredBots) G_AddRandomBot(TEAM_FREE);
            else if (botplayers > desiredBots) G_RemoveRandomBot(TEAM_FREE);
            return;
        }
    }
"""+marker,1)
    p.write_text(s)

# Dedicated scoring records are tagged with a private, per-process nonce and
# hex-encoded. Arbitrary chat/userinfo console text cannot impersonate events.
p=engine/'code/game/g_main.c';s=p.read_text()
if 'Arena authenticated scoring records' not in s:
    pos=s.index('void QDECL G_LogPrintf(')
    marker='\tva_end( argptr );'
    at=s.index(marker,pos)+len(marker)
    s=s[:at]+r'''
    /* Arena authenticated scoring records. Never publish the nonce in serverinfo. */
    if (!Q_strncmp(fmt,"InitGame:",9) || !Q_strncmp(fmt,"ClientConnect:",14) ||
        !Q_strncmp(fmt,"ClientUserinfoChanged:",22) || !Q_strncmp(fmt,"ClientDisconnect:",17) ||
        !Q_strncmp(fmt,"Kill:",5) || !Q_strncmp(fmt,"Exit:",5)) {
        char nonce[64], encoded[2048], record[2200];
        const char *hex="0123456789abcdef";
        int i, n=(int)strlen(string+7);
        trap_Cvar_VariableStringBuffer("arena_logNonce",nonce,sizeof(nonce));
        if (*nonce) {
            for(i=0;i<n && i<1023;i++) {
                unsigned char c=(unsigned char)string[7+i];
                encoded[2*i]=hex[c>>4];encoded[2*i+1]=hex[c&15];
            }
            encoded[2*i]=0;
            Com_sprintf(record,sizeof(record),"ARENA_RECORD %s %s\n",nonce,encoded);
            trap_Print(record);
        }
    }
'''+s[at:]
    p.write_text(s)
