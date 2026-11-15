/**
 * legal-markdown.tsx — рендер юридических документов из файлов Markdown.
 *
 * Файлы лежат в каталоге legal/ корня репозитория и читаются на этапе
 * сборки. Страница остаётся статической.
 */

import fs from "node:fs";
import path from "node:path";

import Markdown from "react-markdown";

export function LegalMarkdown({ file, heading }: { file: string; heading?: string }) {
  let content = fs.readFileSync(path.join(process.cwd(), "legal", file), "utf8");
  if (heading) {
    content = content.replace(/^# .+$/m, `# ${heading}`);
  }
  return (
    <article className="legal-prose mx-auto w-full max-w-3xl px-5 py-14 sm:px-8">
      <Markdown>{content}</Markdown>
    </article>
  );
}
