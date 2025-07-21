const { zokou } = require('../framework/zokou');

zokou({
    nomCom: "online",
    categorie: "Group",
    reaction: "🟢",
    description: "Check who's online in the group (Admins & Owner only)",
    utilisation: ".online",
    alias: ["whosonline", "onlinemembers"],
    filename: __filename
}, async (dest, zk, commandeOptions) => {
    const { repondre, ms, auteurMsg, membreGroupe, estProprietaire, estAdmin, infosGroupe } = commandeOptions;

    try {
        // Check if the command is used in a group
        if (!membreGroupe) {
            return repondre("❌ This command can only be used in a group!");
        }

        // Check if user is either creator or admin
        if (!estProprietaire && !estAdmin && !infosGroupe?.isBotAdmin) {
            return repondre("❌ Only bot owner and group admins can use this command!");
        }

        // Inform user that we're checking
        await repondre("🔄 Scanning for online members... This may take 15-20 seconds.");

        const onlineMembers = new Set();
        const groupData = await zk.groupMetadata(dest);
        const presencePromises = [];

        // Request presence updates for all participants
        for (const participant of groupData.participants) {
            presencePromises.push(
                zk.presenceSubscribe(participant.id)
                    .then(() => {
                        // Additional check for better detection
                        return zk.sendPresenceUpdate('composing', participant.id);
                    })
            );
        }

        await Promise.all(presencePromises);

        // Presence update handler
        const presenceHandler = (json) => {
            for (const id in json.presences) {
                const presence = json.presences[id]?.lastKnownPresence;
                // Check all possible online states
                if (['available', 'composing', 'recording', 'online'].includes(presence)) {
                    onlineMembers.add(id);
                }
            }
        };

        zk.ev.on('presence.update', presenceHandler);

        // Enhanced detection with multiple checks
        const checks = 3;
        const checkInterval = 5000; // 5 seconds
        let checksDone = 0;

        const checkOnline = async () => {
            checksDone++;
            
            if (checksDone >= checks) {
                clearInterval(interval);
                zk.ev.off('presence.update', presenceHandler);
                
                if (onlineMembers.size === 0) {
                    return repondre("⚠️ Couldn't detect any online members. They might be hiding their presence.");
                }
                
                const onlineArray = Array.from(onlineMembers);
                const onlineList = onlineArray.map((member, index) => 
                    `${index + 1}. @${member.split('@')[0]}`
                ).join('\n');
                
                const message = `🟢 *Online Members* (${onlineArray.length}/${groupData.participants.length}):\n\n${onlineList}\n\n` +
                               `_Scanned at: ${new Date().toLocaleTimeString()}_`;
                
                await zk.sendMessage(dest, { 
                    text: message,
                    mentions: onlineArray
                }, { quoted: ms });
            }
        };

        const interval = setInterval(checkOnline, checkInterval);

        // Timeout safety
        setTimeout(() => {
            clearInterval(interval);
            zk.ev.off('presence.update', presenceHandler);
        }, 30000); // 30 seconds max

    } catch (e) {
        console.error("Error in online command:", e);
        repondre(`❌ An error occurred: ${e.message}`);
    }
});
