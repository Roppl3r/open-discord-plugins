import {api, opendiscord, utilities} from "#opendiscord"
import * as discord from "discord.js"
if (utilities.project != "openticket") throw new api.ODPluginError("This plugin only works in Open Ticket!")

//DECLARATION
declare module "#opendiscord-types" {
    export interface ODPluginManagerIds_Default {
        "ot-better-status":api.ODPlugin
    }
    export interface ODConfigManagerIds_Default {
        "ot-better-status:config":OTBetterStatusConfig
    }
    export interface ODCheckerManagerIds_Default {
        "ot-better-status:config":api.ODChecker
    }
}

export const allVariables = [
    "guild.members.all",
    "guild.members.online",
    "guild.members.offline",
    "guild.admins.all",
    "guild.admins.online",
    "guild.admins.offline",
    "guild.bots",
    "guild.roles",
    "guild.channels",
    "stats.tickets.created",
    "stats.tickets.closed",
    "stats.tickets.deleted",
    "stats.tickets.reopened",
    "stats.tickets.autoclosed",
    "stats.tickets.autodeleted",
    "stats.tickets.claimed",
    "stats.tickets.pinned",
    "stats.tickets.moved",
    "stats.users.blacklisted",
    "stats.transcripts.created",
    "tickets.open",
    "tickets.closed",
    "tickets.claimed",
    "tickets.pinned",
    "system.version",
    "system.uptime.minutes",
    "system.uptime.hours",
    "system.uptime.days",
    "system.plugins",
    "system.tickets",
    "system.questions",
    "system.options",
    "system.panels"
]

export type OTBetterStatusAllVariables = (
    "guild.members.all"|
    "guild.members.online"|
    "guild.members.offline"|
    "guild.admins.all"|
    "guild.admins.online"|
    "guild.admins.offline"|
    "guild.bots"|
    "guild.roles"|
    "guild.channels"|
    "stats.tickets.created"|
    "stats.tickets.closed"|
    "stats.tickets.deleted"|
    "stats.tickets.reopened"|
    "stats.tickets.autoclosed"|
    "stats.tickets.autodeleted"|
    "stats.tickets.claimed"|
    "stats.tickets.pinned"|
    "stats.tickets.moved"|
    "stats.users.blacklisted"|
    "stats.transcripts.created"|
    "tickets.open"|
    "tickets.closed"|
    "tickets.claimed"|
    "tickets.pinned"|
    "system.version"|
    "system.uptime.minutes"|
    "system.uptime.hours"|
    "system.uptime.days"|
    "system.plugins"|
    "system.tickets"|
    "system.questions"|
    "system.options"|
    "system.panels"
)

export const betterStatusConfigStructure = new api.ODCheckerObjectStructure("ot-better-status:config",{children:[
    {key:"stateSwitchDelaySeconds",optional:false,priority:0,checker:new api.ODCheckerNumberStructure("ot-better-status:state-switch-delay",{min:10,max:600,floatAllowed:false})},

    {key:"states",optional:false,priority:0,checker:new api.ODCheckerArrayStructure("ot-better-status:states",{disableEmpty:true,allowedTypes:["object"],propertyChecker:new api.ODCheckerObjectStructure("ot-better-status:state",{children:[
        {key:"type",optional:false,priority:0,checker:new api.ODCheckerStringStructure("ot-better-status:state-type",{choices:["listening","watching","playing","custom"]})},
        {key:"text",optional:false,priority:0,checker:new api.ODCheckerStringStructure("ot-better-status:state-text",{minLength:3,maxLength:50})},
        {key:"status",optional:false,priority:0,checker:new api.ODCheckerStringStructure("ot-better-status:state-status",{choices:["online","invisible","idle","dnd"]})},
    ]})})},

    {key:"variables",optional:false,priority:0,checker:new api.ODCheckerArrayStructure("ot-better-status:variables",{disableEmpty:true,allowedTypes:["object"],propertyChecker:new api.ODCheckerObjectStructure("ot-better-status:variable",{children:[
        {key:"name",optional:false,priority:0,checker:new api.ODCheckerStringStructure("ot-better-status:variable-name",{minLength:3,startsWith:"{",endsWith:"}"})},
        {key:"variable",optional:false,priority:0,checker:new api.ODCheckerStringStructure("ot-better-status:variable-variable",{choices:allVariables})},
    ]})})},
]})

//REGISTER CONFIG
export class OTBetterStatusConfig extends api.ODJsonConfig {
    declare data: {
        stateSwitchDelaySeconds:number,
        states:{
            type:"listening"|"watching"|"playing"|"custom",
            text:string,
            status:"online"|"invisible"|"idle"|"dnd"
        }[],
        variables:{
            name:string,
            variable:OTBetterStatusAllVariables
        }[]
    }
}
opendiscord.events.get("onConfigLoad").listen((configs) => {
    configs.add(new OTBetterStatusConfig("ot-better-status:config","config.json","./plugins/ot-better-status/"))
})

//REGISTER CONFIG CHECKER
opendiscord.events.get("onCheckerLoad").listen((checkers) => {
    checkers.add(new api.ODChecker("ot-better-status:config",checkers.storage,0,opendiscord.configs.get("ot-better-status:config"),betterStatusConfigStructure))
})

//ACCESS PRESENCE INTENTS
opendiscord.events.get("onClientLoad").listen((client) => {
    client.privileges.push("Presence")
    client.intents.push("GuildPresences")
})

//DISABLE DEFAULTS (disables the default status behaviour from config/general.json)
opendiscord.defaults.setDefault("clientActivityLoading",false)
opendiscord.defaults.setDefault("clientActivityInitiating",false)

//GET ALL ADMIN MEMBERS
async function getAdminGuildMembers(): Promise<discord.GuildMember[]> {
    const globalAdminIds = opendiscord.configs.get("opendiscord:general").data.globalAdmins
    const ticketAdminIds = opendiscord.configs.get("opendiscord:options").data.filter((opt) => opt.type == "ticket").map((opt) => opt.ticketAdmins.concat(opt.readonlyAdmins))

    const finalAdminIds: string[] = [...globalAdminIds]
    ticketAdminIds.forEach((optAdmins) => {
        optAdmins.forEach((id) => {
            if (!finalAdminIds.includes(id)) finalAdminIds.push(id)
        })
    })

    //return when not in main server
    const mainServer = opendiscord.client.mainServer
    if (!mainServer) return []

    //collect all members
    const members: discord.GuildMember[] = []
    for (const roleId of finalAdminIds){
        try{
            const role = await mainServer.roles.fetch(roleId)
            if (role) role.members.forEach((member) => {
                if (!members.find((m) => m.id == member.id)) members.push(member)
            })
        }catch{}
    }

    return members
}

//PROCESS VARIABLES
async function processVariables(variables:{name:string,variable:OTBetterStatusAllVariables}[], text:string): Promise<string> {
    //return when not in main server
    const mainServer = opendiscord.client.mainServer
    if (!mainServer) return "<ERROR: mainServer>"

    let processedText = text
    for (const vari of variables){
        let content: string
        if (vari.variable == "guild.members.all") content = mainServer.memberCount.toString() ?? "0"
        else if (vari.variable == "guild.members.online") content = (await mainServer.members.list()).filter((m) => m.presence && m.presence.status == "online").size.toString()
        else if (vari.variable == "guild.members.offline") content = (await mainServer.members.list()).filter((m) => m.presence && m.presence.status == "offline").size.toString()
        else if (vari.variable == "guild.admins.all") content = (await getAdminGuildMembers()).length.toString()
        else if (vari.variable == "guild.admins.online") content = (await getAdminGuildMembers()).filter((m) => m.presence && m.presence.status == "online").length.toString()
        else if (vari.variable == "guild.admins.offline") content = (await getAdminGuildMembers()).filter((m) => m.presence && m.presence.status == "offline").length.toString()
        else if (vari.variable == "guild.bots") content = (await mainServer.members.list()).filter((m) => m.user.bot).size.toString()
        else if (vari.variable == "guild.roles") content = mainServer.roles.cache.size.toString()
        else if (vari.variable == "guild.channels") content = mainServer.channels.cache.size.toString()
        else if (vari.variable == "stats.tickets.created") content = (await opendiscord.stats.get("opendiscord:global").getStat("opendiscord:tickets-created"))?.toString() ?? "0"
        else if (vari.variable == "stats.tickets.closed") content = (await opendiscord.stats.get("opendiscord:global").getStat("opendiscord:tickets-closed"))?.toString() ?? "0"
        else if (vari.variable == "stats.tickets.deleted") content = (await opendiscord.stats.get("opendiscord:global").getStat("opendiscord:tickets-deleted"))?.toString() ?? "0"
        else if (vari.variable == "stats.tickets.reopened") content = (await opendiscord.stats.get("opendiscord:global").getStat("opendiscord:tickets-reopened"))?.toString() ?? "0"
        else if (vari.variable == "stats.tickets.autoclosed") content = (await opendiscord.stats.get("opendiscord:global").getStat("opendiscord:tickets-autoclosed"))?.toString() ?? "0"
        else if (vari.variable == "stats.tickets.autodeleted") content = (await opendiscord.stats.get("opendiscord:global").getStat("opendiscord:tickets-autodeleted"))?.toString() ?? "0"
        else if (vari.variable == "stats.tickets.claimed") content = (await opendiscord.stats.get("opendiscord:global").getStat("opendiscord:tickets-claimed"))?.toString() ?? "0"
        else if (vari.variable == "stats.tickets.pinned") content = (await opendiscord.stats.get("opendiscord:global").getStat("opendiscord:tickets-pinned"))?.toString() ?? "0"
        else if (vari.variable == "stats.tickets.moved") content = (await opendiscord.stats.get("opendiscord:global").getStat("opendiscord:tickets-moved"))?.toString() ?? "0"
        else if (vari.variable == "stats.users.blacklisted") content = (await opendiscord.stats.get("opendiscord:global").getStat("opendiscord:users-blacklisted"))?.toString() ?? "0"
        else if (vari.variable == "stats.transcripts.created") content = (await opendiscord.stats.get("opendiscord:global").getStat("opendiscord:transcripts-created"))?.toString() ?? "0"
        else if (vari.variable == "tickets.open") content = opendiscord.tickets.getFiltered((ticket) => !ticket.get("opendiscord:closed").value).length.toString()
        else if (vari.variable == "tickets.closed") content = opendiscord.tickets.getFiltered((ticket) => ticket.get("opendiscord:closed").value).length.toString()
        else if (vari.variable == "tickets.claimed") content = opendiscord.tickets.getFiltered((ticket) => ticket.get("opendiscord:claimed").value).length.toString()
        else if (vari.variable == "tickets.pinned") content = opendiscord.tickets.getFiltered((ticket) => ticket.get("opendiscord:pinned").value).length.toString()
        else if (vari.variable == "system.version") content = opendiscord.versions.get("opendiscord:version").toString()
        else if (vari.variable == "system.uptime.minutes") content = Math.floor((new Date().getTime() - opendiscord.processStartupDate.getTime())/1000/60).toString()
        else if (vari.variable == "system.uptime.hours") content = Math.floor((new Date().getTime() - opendiscord.processStartupDate.getTime())/1000/60/60).toString()
        else if (vari.variable == "system.uptime.days") content = Math.floor((new Date().getTime() - opendiscord.processStartupDate.getTime())/1000/60/60/24).toString()
        else if (vari.variable == "system.plugins") content = opendiscord.plugins.getLength().toString()
        else if (vari.variable == "system.tickets") content = opendiscord.tickets.getLength().toString()
        else if (vari.variable == "system.questions") content = opendiscord.questions.getLength().toString()
        else if (vari.variable == "system.options") content = opendiscord.options.getLength().toString()
        else if (vari.variable == "system.panels") content = opendiscord.panels.getLength().toString()
        else content = ""

        processedText = processedText.replaceAll(vari.name,content)
    }

    return processedText
}

//REGISTER CLIENT ACTIVITY
opendiscord.events.get("onClientActivityInit").listen((activity) => {
    const config = opendiscord.configs.get("ot-better-status:config")
    const switchDelay = config.data.stateSwitchDelaySeconds*1000
    const states = config.data.states
    const variables = config.data.variables
    let state = 0
    const maxState = config.data.states.length-1

    //first status starts after bot initialisation
    opendiscord.events.get("onReadyForUsage").listen(async () => {
        opendiscord.client.activity.setStatus(states[0].type,await processVariables(variables,states[0].text),states[0].status,true)
        setInterval(async () => {
            state = (state >= maxState) ? 0 : state+1
            opendiscord.client.activity.setStatus(states[state].type,await processVariables(variables,states[state].text),states[state].status,true)
        },switchDelay)
    })
})