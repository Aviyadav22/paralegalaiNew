const { v4 } = require("uuid");
const fs = require("fs");
const { tokenizeString } = require("../../utils/tokenizer");
const {
  createdDate,
  trashFile,
  writeToServerDocuments,
} = require("../../utils/files");
const { default: slugify } = require("slugify");
const { storeOriginalFile } = require("../../../server/utils/originalFiles");

async function asTxt({
  fullFilePath = "",
  filename = "",
  options = {},
  metadata = {},
}) {
  let content = "";
  try {
    content = fs.readFileSync(fullFilePath, "utf8");
  } catch (err) {
    console.error("Could not read file!", err);
  }

  if (!content?.length) {
    console.error(`Resulting text content was empty for ${filename}.`);
    trashFile(fullFilePath);
    return {
      success: false,
      reason: `No text content found in ${filename}.`,
      documents: [],
    };
  }

  console.log(`-- Working ${filename} --`);
  
  // Store the original file before processing
  const originalFileResult = await storeOriginalFile({
    originalFilePath: fullFilePath,
    filename: filename,
    metadata: {
      title: metadata.title || filename,
      docAuthor: metadata.docAuthor || "Unknown",
      description: metadata.description || "Unknown",
      docSource: metadata.docSource || "a text file uploaded by the user.",
      fileType: "text"
    }
  });

  const data = {
    id: v4(),
    url: "file://" + fullFilePath,
    title: metadata.title || filename,
    docAuthor: metadata.docAuthor || "Unknown",
    description: metadata.description || "Unknown",
    docSource: metadata.docSource || "a text file uploaded by the user.",
    chunkSource: metadata.chunkSource || "",
    published: createdDate(fullFilePath),
    wordCount: content.split(" ").length,
    pageContent: content,
    token_count_estimate: tokenizeString(content),
    // Add original file information for citations
    originalFileId: originalFileResult.success ? originalFileResult.fileId : null,
    originalFileName: filename,
    originalFileType: "text"
  };

  const document = writeToServerDocuments({
    data,
    filename: `${slugify(filename)}-${data.id}`,
    options: { parseOnly: options.parseOnly },
  });
  trashFile(fullFilePath);
  console.log(`[SUCCESS]: ${filename} converted & ready for embedding.\n`);
  return { success: true, reason: null, documents: [document] };
}

module.exports = asTxt;
