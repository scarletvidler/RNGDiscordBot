import {
  ChannelType,
  type ForumChannel,
  type Guild,
  type ThreadChannel,
} from "discord.js";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const DOCS_DIR = path.join(process.cwd(), "docs", "how-to");
const DISCORD_MESSAGE_LIMIT = 2000;

interface HowToDoc {
  slug: string;
  title: string;
  content: string;
}

interface SyncResult {
  created: string[];
  updated: string[];
  skipped: string[];
}

export async function syncHowToDocs(
  guild: Guild,
  channelName = "how-to-lerche",
): Promise<SyncResult> {
  const guildChannels = await guild.channels.fetch();
  const channel = guildChannels.find(
    (guildChannel) =>
      guildChannel?.name === channelName &&
      guildChannel.type === ChannelType.GuildForum,
  ) as ForumChannel | undefined;

  if (!channel) {
    throw new Error(`Could not find a forum channel named "${channelName}".`);
  }

  const docs = await readHowToDocs();
  const threads = await fetchForumThreads(channel);
  const result: SyncResult = { created: [], updated: [], skipped: [] };

  for (const doc of docs) {
    if (doc.content.length > DISCORD_MESSAGE_LIMIT) {
      result.skipped.push(
        `${doc.title} is ${doc.content.length} characters; Discord posts must be ${DISCORD_MESSAGE_LIMIT} or less.`,
      );
      continue;
    }

    const existingThread = threads.find((thread) => thread.name === doc.title);

    if (!existingThread) {
      await channel.threads.create({
        name: doc.title,
        message: {
          content: doc.content,
        },
      });
      result.created.push(doc.title);
      continue;
    }

    const starterMessage = await existingThread.fetchStarterMessage();
    if (!starterMessage) {
      result.skipped.push(`${doc.title} has no starter message to update.`);
      continue;
    }

    if (starterMessage.content !== doc.content) {
      if (existingThread.archived) {
        await existingThread.setArchived(false);
      }
      await starterMessage.edit(doc.content);
      result.updated.push(doc.title);
    }
  }

  return result;
}

async function readHowToDocs(): Promise<HowToDoc[]> {
  const files = (await readdir(DOCS_DIR))
    .filter((file) => file.endsWith(".md"))
    .sort((a, b) => a.localeCompare(b));

  return Promise.all(
    files.map(async (file) => {
      const content = (
        await readFile(path.join(DOCS_DIR, file), "utf8")
      ).trim();
      const title = getTitle(content, file);
      return {
        slug: file.replace(/\.md$/, ""),
        title,
        content,
      };
    }),
  );
}

function getTitle(content: string, fileName: string): string {
  const heading = content.match(/^#\s+(.+)$/m)?.[1]?.trim();
  if (heading) return heading.slice(0, 100);

  return fileName
    .replace(/^\d+[-_]/, "")
    .replace(/\.md$/, "")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .slice(0, 100);
}

async function fetchForumThreads(
  channel: ForumChannel,
): Promise<ThreadChannel[]> {
  const activeThreads = await channel.threads.fetchActive();
  const archivedThreads = await channel.threads.fetchArchived({
    type: "public",
    limit: 100,
  });

  return [
    ...activeThreads.threads.values(),
    ...archivedThreads.threads.values(),
  ];
}
