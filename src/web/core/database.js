/**
 * Database Module
 * 
 * MongoDB connection and GridFS storage management.
 * Handles web_pages, web_failures collections and screenshot storage.
 */

const { MongoClient, GridFSBucket, ObjectId } = require("mongodb");
const { getConfig } = require("./config");
const { logger, routeKeyFromUrl } = require("./utils");

let _client = null;
let _db = null;
let _bucket = null;

// ═══════════════════════════════════════════════════════════════════════════
// Connection Management
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Connect to MongoDB
 */
async function connect(options = {}) {
  if (_client && _db) {
    return { client: _client, db: _db };
  }

  const config = getConfig();
  const uri = options.uri || config.mongoUri;
  const dbName = options.dbName || config.mongoDbName;

  logger.info(`Connecting to MongoDB: ${dbName}`);
  
  _client = new MongoClient(uri, {
    maxPoolSize: options.maxPoolSize || 10,
  });

  await _client.connect();
  _db = _client.db(dbName);
  
  logger.info("MongoDB connected");
  return { client: _client, db: _db };
}

/**
 * Get database instance
 */
function getDb() {
  if (!_db) {
    throw new Error("Database not connected. Call connect() first.");
  }
  return _db;
}

/**
 * Get collection by name
 */
function getCollection(name) {
  return getDb().collection(name);
}

/**
 * Close database connection
 */
async function disconnect() {
  if (_client) {
    await _client.close();
    _client = null;
    _db = null;
    _bucket = null;
    logger.info("MongoDB disconnected");
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// GridFS Storage
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get GridFS bucket for screenshot storage
 */
function getBucket() {
  if (!_bucket) {
    const config = getConfig();
    _bucket = new GridFSBucket(getDb(), {
      bucketName: config.gridFsBucket,
    });
  }
  return _bucket;
}

/**
 * Upload screenshot to GridFS
 */
async function uploadScreenshot(buffer, filename, metadata = {}) {
  const bucket = getBucket();
  
  return new Promise((resolve, reject) => {
    const uploadStream = bucket.openUploadStream(filename, { metadata });
    
    uploadStream.on("error", reject);
    uploadStream.on("finish", () => {
      resolve({
        fileId: uploadStream.id,
        filename,
        size: buffer.length,
      });
    });
    
    uploadStream.end(buffer);
  });
}

/**
 * Upload multiple screenshots
 */
async function uploadScreenshots(screenshots, routeKey, metadata = {}) {
  const results = [];
  
  for (const shot of screenshots) {
    const filename = `${routeKey}/${shot.name || shot.index || results.length}.png`;
    
    const result = await uploadScreenshot(shot.buffer, filename, {
      ...metadata,
      routeKey,
      name: shot.name,
      type: shot.type,
      label: shot.label,
      dimensions: shot.dimensions,
      capturedAt: shot.capturedAt || new Date().toISOString(),
    });

    results.push({
      fileId: result.fileId,
      name: shot.name,
      type: shot.type,
      label: shot.label,
    });
  }

  return results;
}

/**
 * Get screenshot by fileId
 */
async function getScreenshot(fileId) {
  const bucket = getBucket();
  const chunks = [];

  return new Promise((resolve, reject) => {
    const downloadStream = bucket.openDownloadStream(new ObjectId(fileId));
    
    downloadStream.on("error", reject);
    downloadStream.on("data", chunk => chunks.push(chunk));
    downloadStream.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

/**
 * Delete screenshots for a route
 */
async function deleteScreenshots(routeKey) {
  const bucket = getBucket();
  const files = await bucket.find({ "metadata.routeKey": routeKey }).toArray();
  
  for (const file of files) {
    await bucket.delete(file._id);
  }
  
  return files.length;
}

// ═══════════════════════════════════════════════════════════════════════════
// Web Pages Collection
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Save web page data
 */
async function saveWebPage(data) {
  const collection = getCollection("web_pages");
  
  const doc = {
    ...data,
    updatedAt: new Date(),
  };

  if (!doc.createdAt) {
    doc.createdAt = new Date();
  }

  const result = await collection.updateOne(
    { routeKey: data.routeKey },
    { $set: doc },
    { upsert: true }
  );

  return result;
}

/**
 * Get web page by routeKey
 */
async function getWebPage(routeKey) {
  const collection = getCollection("web_pages");
  return await collection.findOne({ routeKey });
}

/**
 * Check if web page exists
 */
async function webPageExists(routeKey) {
  const collection = getCollection("web_pages");
  const count = await collection.countDocuments({ routeKey });
  return count > 0;
}

/**
 * List web pages with filters
 */
async function listWebPages(filter = {}, options = {}) {
  const collection = getCollection("web_pages");
  
  return await collection
    .find(filter)
    .sort(options.sort || { updatedAt: -1 })
    .limit(options.limit || 100)
    .skip(options.skip || 0)
    .toArray();
}

// ═══════════════════════════════════════════════════════════════════════════
// Web Failures Collection
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Save web failure
 */
async function saveWebFailure(data) {
  const collection = getCollection("web_failures");
  
  const doc = {
    ...data,
    updatedAt: new Date(),
  };

  if (!doc.createdAt) {
    doc.createdAt = new Date();
  }

  const result = await collection.updateOne(
    { routeKey: data.routeKey },
    { $set: doc },
    { upsert: true }
  );

  return result;
}

/**
 * Get web failure by routeKey
 */
async function getWebFailure(routeKey) {
  const collection = getCollection("web_failures");
  return await collection.findOne({ routeKey });
}

/**
 * List web failures
 */
async function listWebFailures(filter = {}, options = {}) {
  const collection = getCollection("web_failures");
  
  return await collection
    .find(filter)
    .sort(options.sort || { updatedAt: -1 })
    .limit(options.limit || 100)
    .skip(options.skip || 0)
    .toArray();
}

// ═══════════════════════════════════════════════════════════════════════════
// Routes Collection
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get all routes from routes.json style collection or file
 */
async function getRoutes(options = {}) {
  const config = getConfig();
  
  // Try loading from file first
  try {
    const { loadJson } = require("./utils");
    const routes = loadJson(config.routesJsonPath, []);
    
    if (routes.length > 0) {
      logger.debug(`Loaded ${routes.length} routes from file`);
      return routes;
    }
  } catch (e) {}

  // Try collection
  try {
    const collection = getCollection("routes");
    const routes = await collection.find({}).toArray();
    return routes;
  } catch (e) {
    logger.warn("No routes found");
    return [];
  }
}

/**
 * Filter routes by pattern
 */
function filterRoutes(routes, pattern) {
  if (!pattern) return routes;
  
  const regex = new RegExp(pattern, "i");
  return routes.filter(r => {
    const url = r.url || r.path || "";
    return regex.test(url);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Utilities
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Ensure indexes exist
 */
async function ensureIndexes() {
  const webPages = getCollection("web_pages");
  const webFailures = getCollection("web_failures");

  await webPages.createIndex({ routeKey: 1 }, { unique: true });
  await webPages.createIndex({ domain: 1 });
  await webPages.createIndex({ "extraction.status": 1 });
  await webPages.createIndex({ updatedAt: -1 });

  await webFailures.createIndex({ routeKey: 1 }, { unique: true });
  await webFailures.createIndex({ domain: 1 });
  await webFailures.createIndex({ errorCategory: 1 });

  logger.debug("Database indexes ensured");
}

module.exports = {
  connect,
  getDb,
  getCollection,
  disconnect,
  getBucket,
  uploadScreenshot,
  uploadScreenshots,
  getScreenshot,
  deleteScreenshots,
  saveWebPage,
  getWebPage,
  webPageExists,
  listWebPages,
  saveWebFailure,
  getWebFailure,
  listWebFailures,
  getRoutes,
  filterRoutes,
  ensureIndexes,
  ObjectId,
};
