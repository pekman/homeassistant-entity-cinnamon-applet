import archiver from "archiver";
import fs from "node:fs/promises";

import metadataJson from "../assets/metadata.json" with { type: "json" };
import packageJson from "../package.json" with { type: "json" };


export default async () => {
    const fh = await fs.open(
        `${metadataJson.uuid}-${packageJson.version}.zip`,
        "w");
    const zip = archiver("zip", { zlib: { level: 9 } });
    zip.pipe(fh.createWriteStream());

    zip.glob(
        "**",
        {
            cwd: "dist",
            nodir: true,
            ignore: "__pycache__",
        },
        {
            prefix: metadataJson.uuid,
        });
    zip.finalize();
};
