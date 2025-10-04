const { getOriginalFilePath, getOriginalFileMetadata } = require("../../utils/originalFiles");
const path = require("path");

function apiOriginalFilesEndpoints(app) {
  if (!app) return;

  /**
   * @swagger
   * /api/original-files/{fileId}:
   *   get:
   *     summary: Download original file
   *     tags: [Original Files]
   *     parameters:
   *       - in: path
   *         name: fileId
   *         required: true
   *         schema:
   *           type: string
   *         description: The file ID of the original file
   *     responses:
   *       200:
   *         description: Original file content
   *         content:
   *           application/pdf:
   *             schema:
   *               type: string
   *               format: binary
   *           text/plain:
   *             schema:
   *               type: string
   *           application/octet-stream:
   *             schema:
   *               type: string
   *               format: binary
   *       404:
   *         description: File not found
   *       500:
   *         description: Server error
   */
  app.get("/original-files/:fileId", async (request, response) => {
    try {
      const { fileId } = request.params;
      
      if (!fileId) {
        return response.status(400).json({
          success: false,
          error: "File ID is required"
        });
      }

      // Get file metadata
      const metadata = await getOriginalFileMetadata(fileId);
      if (!metadata) {
        return response.status(404).json({
          success: false,
          error: "File not found"
        });
      }

      // Get file path
      const fileResult = await getOriginalFilePath(fileId);
      if (!fileResult.success) {
        return response.status(404).json({
          success: false,
          error: fileResult.error
        });
      }

      // Set appropriate headers for inline viewing
      response.setHeader('Content-Type', metadata.mimeType);
      response.setHeader('Content-Disposition', `inline; filename="${metadata.originalFilename}"`);
      response.setHeader('Content-Length', metadata.fileSize);
      response.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour

      // Send the file
      response.sendFile(fileResult.filePath, (err) => {
        if (err) {
          console.error("Error sending file:", err);
          if (!response.headersSent) {
            response.status(500).json({
              success: false,
              error: "Error serving file"
            });
          }
        }
      });

    } catch (error) {
      console.error("Error in original files endpoint:", error);
      response.status(500).json({
        success: false,
        error: "Internal server error"
      });
    }
  });

  /**
   * @swagger
   * /api/original-files/{fileId}/info:
   *   get:
   *     summary: Get original file metadata
   *     tags: [Original Files]
   *     parameters:
   *       - in: path
   *         name: fileId
   *         required: true
   *         schema:
   *           type: string
   *         description: The file ID of the original file
   *     responses:
   *       200:
   *         description: File metadata
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                 data:
   *                   type: object
   *                   properties:
   *                     fileId:
   *                       type: string
   *                     originalFilename:
   *                       type: string
   *                     fileSize:
   *                       type: number
   *                     mimeType:
   *                       type: string
   *                     createdAt:
   *                       type: string
   *       404:
   *         description: File not found
   *       500:
   *         description: Server error
   */
  app.get("/original-files/:fileId/info", async (request, response) => {
    try {
      const { fileId } = request.params;
      
      if (!fileId) {
        return response.status(400).json({
          success: false,
          error: "File ID is required"
        });
      }

      const metadata = await getOriginalFileMetadata(fileId);
      if (!metadata) {
        return response.status(404).json({
          success: false,
          error: "File not found"
        });
      }

      // Return safe metadata (exclude internal paths)
      const safeMetadata = {
        fileId: metadata.fileId,
        originalFilename: metadata.originalFilename,
        fileSize: metadata.fileSize,
        mimeType: metadata.mimeType,
        createdAt: metadata.createdAt,
        title: metadata.title,
        docAuthor: metadata.docAuthor,
        description: metadata.description,
        fileType: metadata.fileType
      };

      response.status(200).json({
        success: true,
        data: safeMetadata
      });

    } catch (error) {
      console.error("Error in original files info endpoint:", error);
      response.status(500).json({
        success: false,
        error: "Internal server error"
      });
    }
  });
}

module.exports = { apiOriginalFilesEndpoints };
