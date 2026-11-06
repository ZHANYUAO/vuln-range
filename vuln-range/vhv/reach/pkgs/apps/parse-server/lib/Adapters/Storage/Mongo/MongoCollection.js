"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
exports.findGeoIndexField = findGeoIndexField;
const mongodb = require('mongodb');
const Collection = mongodb.Collection;

// Query operators that require a geospatial index and therefore trigger
// on-demand `2d` index creation. `$geoWithin` / `$geoIntersects` are intentionally
// excluded: they can run as a collection scan and never raise a "no index" error.
const GEO_INDEX_QUERY_OPERATORS = ['$nearSphere', '$near', '$geoNear'];

// Find the field in a Mongo query document that is constrained by a geo operator
// requiring a geospatial index. Returns the field name (e.g. 'location'), or
// undefined if none is found. Used as the reliable source of truth for on-demand
// geo index creation, since the MongoDB error message that used to carry the field
// name (`... field=<name> ...`) was dropped in MongoDB 8.3+.
//
// A geo-near expression must be top-level or inside `$and`: MongoDB rejects it inside
// `$or` / `$nor` ("geo $near must be top-level expr") and forbids more than one per
// query ("Too many geoNear expressions"). So there is at most one field to find, and
// `$and` is the only combinator we need to recurse into.
function findGeoIndexField(query) {
  if (!query || typeof query !== 'object') {
    return undefined;
  }
  for (const field of Object.keys(query)) {
    const value = query[field];
    // Recurse into `$and`, which holds an array of sub-queries.
    if (field === '$and' && Array.isArray(value)) {
      for (const subQuery of value) {
        const found = findGeoIndexField(subQuery);
        if (found) {
          return found;
        }
      }
      continue;
    }
    if (value && typeof value === 'object' && GEO_INDEX_QUERY_OPERATORS.some(op => Object.prototype.hasOwnProperty.call(value, op))) {
      return field;
    }
  }
  return undefined;
}
class MongoCollection {
  constructor(mongoCollection) {
    this._mongoCollection = mongoCollection;
  }

  // Does a find with "smart indexing".
  // Currently this just means, if it needs a geoindex and there is
  // none, then build the geoindex.
  // This could be improved a lot but it's not clear if that's a good
  // idea. Or even if this behavior is a good idea.
  find(query, {
    skip,
    limit,
    sort,
    keys,
    maxTimeMS,
    batchSize,
    readPreference,
    hint,
    caseInsensitive,
    explain,
    comment
  } = {}) {
    // Support for Full Text Search - $text
    if (keys && keys.$score) {
      delete keys.$score;
      keys.score = {
        $meta: 'textScore'
      };
    }
    return this._rawFind(query, {
      skip,
      limit,
      sort,
      keys,
      maxTimeMS,
      batchSize,
      readPreference,
      hint,
      caseInsensitive,
      explain,
      comment
    }).catch(error => {
      // Check for "no geoindex" error
      if (error.code != 17007 && !error.message.match(/unable to find index for .geoNear/)) {
        throw error;
      }
      // Figure out which field needs a geo index.
      // Older MongoDB embeds the field name in the error message (`... field=<name> ...`);
      // MongoDB 8.3+ shortened the message to `unable to find index for $geoNear query`
      // and no longer includes it, so fall back to reading the field from the query itself.
      const messageMatch = error.message.match(/field=([A-Za-z_0-9]+) /);
      const key = messageMatch && messageMatch[1] || findGeoIndexField(query);
      if (!key) {
        throw error;
      }
      var index = {};
      index[key] = '2d';
      return this._mongoCollection.createIndex(index)
      // Retry, but just once.
      .then(() => this._rawFind(query, {
        skip,
        limit,
        sort,
        keys,
        maxTimeMS,
        batchSize,
        readPreference,
        hint,
        caseInsensitive,
        explain,
        comment
      }));
    });
  }

  /**
   * Collation to support case insensitive queries
   */
  static caseInsensitiveCollation() {
    return {
      locale: 'en_US',
      strength: 2
    };
  }
  _rawFind(query, {
    skip,
    limit,
    sort,
    keys,
    maxTimeMS,
    batchSize,
    readPreference,
    hint,
    caseInsensitive,
    explain,
    comment
  } = {}) {
    let findOperation = this._mongoCollection.find(query, {
      skip,
      limit,
      sort,
      readPreference,
      hint,
      comment,
      batchSize
    });
    if (keys) {
      findOperation = findOperation.project(keys);
    }
    if (caseInsensitive) {
      findOperation = findOperation.collation(MongoCollection.caseInsensitiveCollation());
    }
    if (maxTimeMS) {
      findOperation = findOperation.maxTimeMS(maxTimeMS);
    }
    return explain ? findOperation.explain(explain) : findOperation.toArray();
  }
  count(query, {
    skip,
    limit,
    sort,
    maxTimeMS,
    readPreference,
    hint,
    comment
  } = {}) {
    // If query is empty, then use estimatedDocumentCount instead.
    // This is due to countDocuments performing a scan,
    // which greatly increases execution time when being run on large collections.
    // See https://github.com/Automattic/mongoose/issues/6713 for more info regarding this problem.
    if (typeof query !== 'object' || !Object.keys(query).length) {
      return this._mongoCollection.estimatedDocumentCount({
        maxTimeMS
      });
    }
    const countOperation = this._mongoCollection.countDocuments(query, {
      skip,
      limit,
      sort,
      maxTimeMS,
      readPreference,
      hint,
      comment
    });
    return countOperation;
  }
  distinct(field, query) {
    return this._mongoCollection.distinct(field, query);
  }
  aggregate(pipeline, {
    maxTimeMS,
    batchSize,
    readPreference,
    hint,
    explain,
    comment
  } = {}) {
    return this._mongoCollection.aggregate(pipeline, {
      maxTimeMS,
      batchSize,
      readPreference,
      hint,
      explain,
      comment
    }).toArray();
  }
  insertOne(object, session) {
    return this._mongoCollection.insertOne(object, {
      session
    });
  }

  // Atomically updates data in the database for a single (first) object that matched the query
  // If there is nothing that matches the query - does insert
  // Postgres Note: `INSERT ... ON CONFLICT UPDATE` that is available since 9.5.
  upsertOne(query, update, session) {
    return this._mongoCollection.updateOne(query, update, {
      upsert: true,
      session
    });
  }
  updateOne(query, update) {
    return this._mongoCollection.updateOne(query, update);
  }
  updateMany(query, update, session) {
    return this._mongoCollection.updateMany(query, update, {
      session
    });
  }
  deleteMany(query, session) {
    return this._mongoCollection.deleteMany(query, {
      session
    });
  }
  _ensureSparseUniqueIndexInBackground(indexRequest) {
    return this._mongoCollection.createIndex(indexRequest, {
      unique: true,
      background: true,
      sparse: true
    });
  }
  drop() {
    return this._mongoCollection.drop();
  }
}
exports.default = MongoCollection;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJtb25nb2RiIiwicmVxdWlyZSIsIkNvbGxlY3Rpb24iLCJHRU9fSU5ERVhfUVVFUllfT1BFUkFUT1JTIiwiZmluZEdlb0luZGV4RmllbGQiLCJxdWVyeSIsInVuZGVmaW5lZCIsImZpZWxkIiwiT2JqZWN0Iiwia2V5cyIsInZhbHVlIiwiQXJyYXkiLCJpc0FycmF5Iiwic3ViUXVlcnkiLCJmb3VuZCIsInNvbWUiLCJvcCIsInByb3RvdHlwZSIsImhhc093blByb3BlcnR5IiwiY2FsbCIsIk1vbmdvQ29sbGVjdGlvbiIsImNvbnN0cnVjdG9yIiwibW9uZ29Db2xsZWN0aW9uIiwiX21vbmdvQ29sbGVjdGlvbiIsImZpbmQiLCJza2lwIiwibGltaXQiLCJzb3J0IiwibWF4VGltZU1TIiwiYmF0Y2hTaXplIiwicmVhZFByZWZlcmVuY2UiLCJoaW50IiwiY2FzZUluc2Vuc2l0aXZlIiwiZXhwbGFpbiIsImNvbW1lbnQiLCIkc2NvcmUiLCJzY29yZSIsIiRtZXRhIiwiX3Jhd0ZpbmQiLCJjYXRjaCIsImVycm9yIiwiY29kZSIsIm1lc3NhZ2UiLCJtYXRjaCIsIm1lc3NhZ2VNYXRjaCIsImtleSIsImluZGV4IiwiY3JlYXRlSW5kZXgiLCJ0aGVuIiwiY2FzZUluc2Vuc2l0aXZlQ29sbGF0aW9uIiwibG9jYWxlIiwic3RyZW5ndGgiLCJmaW5kT3BlcmF0aW9uIiwicHJvamVjdCIsImNvbGxhdGlvbiIsInRvQXJyYXkiLCJjb3VudCIsImxlbmd0aCIsImVzdGltYXRlZERvY3VtZW50Q291bnQiLCJjb3VudE9wZXJhdGlvbiIsImNvdW50RG9jdW1lbnRzIiwiZGlzdGluY3QiLCJhZ2dyZWdhdGUiLCJwaXBlbGluZSIsImluc2VydE9uZSIsIm9iamVjdCIsInNlc3Npb24iLCJ1cHNlcnRPbmUiLCJ1cGRhdGUiLCJ1cGRhdGVPbmUiLCJ1cHNlcnQiLCJ1cGRhdGVNYW55IiwiZGVsZXRlTWFueSIsIl9lbnN1cmVTcGFyc2VVbmlxdWVJbmRleEluQmFja2dyb3VuZCIsImluZGV4UmVxdWVzdCIsInVuaXF1ZSIsImJhY2tncm91bmQiLCJzcGFyc2UiLCJkcm9wIiwiZXhwb3J0cyIsImRlZmF1bHQiXSwic291cmNlcyI6WyIuLi8uLi8uLi8uLi9zcmMvQWRhcHRlcnMvU3RvcmFnZS9Nb25nby9Nb25nb0NvbGxlY3Rpb24uanMiXSwic291cmNlc0NvbnRlbnQiOlsiY29uc3QgbW9uZ29kYiA9IHJlcXVpcmUoJ21vbmdvZGInKTtcbmNvbnN0IENvbGxlY3Rpb24gPSBtb25nb2RiLkNvbGxlY3Rpb247XG5cbi8vIFF1ZXJ5IG9wZXJhdG9ycyB0aGF0IHJlcXVpcmUgYSBnZW9zcGF0aWFsIGluZGV4IGFuZCB0aGVyZWZvcmUgdHJpZ2dlclxuLy8gb24tZGVtYW5kIGAyZGAgaW5kZXggY3JlYXRpb24uIGAkZ2VvV2l0aGluYCAvIGAkZ2VvSW50ZXJzZWN0c2AgYXJlIGludGVudGlvbmFsbHlcbi8vIGV4Y2x1ZGVkOiB0aGV5IGNhbiBydW4gYXMgYSBjb2xsZWN0aW9uIHNjYW4gYW5kIG5ldmVyIHJhaXNlIGEgXCJubyBpbmRleFwiIGVycm9yLlxuY29uc3QgR0VPX0lOREVYX1FVRVJZX09QRVJBVE9SUyA9IFsnJG5lYXJTcGhlcmUnLCAnJG5lYXInLCAnJGdlb05lYXInXTtcblxuLy8gRmluZCB0aGUgZmllbGQgaW4gYSBNb25nbyBxdWVyeSBkb2N1bWVudCB0aGF0IGlzIGNvbnN0cmFpbmVkIGJ5IGEgZ2VvIG9wZXJhdG9yXG4vLyByZXF1aXJpbmcgYSBnZW9zcGF0aWFsIGluZGV4LiBSZXR1cm5zIHRoZSBmaWVsZCBuYW1lIChlLmcuICdsb2NhdGlvbicpLCBvclxuLy8gdW5kZWZpbmVkIGlmIG5vbmUgaXMgZm91bmQuIFVzZWQgYXMgdGhlIHJlbGlhYmxlIHNvdXJjZSBvZiB0cnV0aCBmb3Igb24tZGVtYW5kXG4vLyBnZW8gaW5kZXggY3JlYXRpb24sIHNpbmNlIHRoZSBNb25nb0RCIGVycm9yIG1lc3NhZ2UgdGhhdCB1c2VkIHRvIGNhcnJ5IHRoZSBmaWVsZFxuLy8gbmFtZSAoYC4uLiBmaWVsZD08bmFtZT4gLi4uYCkgd2FzIGRyb3BwZWQgaW4gTW9uZ29EQiA4LjMrLlxuLy9cbi8vIEEgZ2VvLW5lYXIgZXhwcmVzc2lvbiBtdXN0IGJlIHRvcC1sZXZlbCBvciBpbnNpZGUgYCRhbmRgOiBNb25nb0RCIHJlamVjdHMgaXQgaW5zaWRlXG4vLyBgJG9yYCAvIGAkbm9yYCAoXCJnZW8gJG5lYXIgbXVzdCBiZSB0b3AtbGV2ZWwgZXhwclwiKSBhbmQgZm9yYmlkcyBtb3JlIHRoYW4gb25lIHBlclxuLy8gcXVlcnkgKFwiVG9vIG1hbnkgZ2VvTmVhciBleHByZXNzaW9uc1wiKS4gU28gdGhlcmUgaXMgYXQgbW9zdCBvbmUgZmllbGQgdG8gZmluZCwgYW5kXG4vLyBgJGFuZGAgaXMgdGhlIG9ubHkgY29tYmluYXRvciB3ZSBuZWVkIHRvIHJlY3Vyc2UgaW50by5cbmV4cG9ydCBmdW5jdGlvbiBmaW5kR2VvSW5kZXhGaWVsZChxdWVyeSkge1xuICBpZiAoIXF1ZXJ5IHx8IHR5cGVvZiBxdWVyeSAhPT0gJ29iamVjdCcpIHtcbiAgICByZXR1cm4gdW5kZWZpbmVkO1xuICB9XG4gIGZvciAoY29uc3QgZmllbGQgb2YgT2JqZWN0LmtleXMocXVlcnkpKSB7XG4gICAgY29uc3QgdmFsdWUgPSBxdWVyeVtmaWVsZF07XG4gICAgLy8gUmVjdXJzZSBpbnRvIGAkYW5kYCwgd2hpY2ggaG9sZHMgYW4gYXJyYXkgb2Ygc3ViLXF1ZXJpZXMuXG4gICAgaWYgKGZpZWxkID09PSAnJGFuZCcgJiYgQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHtcbiAgICAgIGZvciAoY29uc3Qgc3ViUXVlcnkgb2YgdmFsdWUpIHtcbiAgICAgICAgY29uc3QgZm91bmQgPSBmaW5kR2VvSW5kZXhGaWVsZChzdWJRdWVyeSk7XG4gICAgICAgIGlmIChmb3VuZCkge1xuICAgICAgICAgIHJldHVybiBmb3VuZDtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIGlmIChcbiAgICAgIHZhbHVlICYmXG4gICAgICB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmXG4gICAgICBHRU9fSU5ERVhfUVVFUllfT1BFUkFUT1JTLnNvbWUob3AgPT4gT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHZhbHVlLCBvcCkpXG4gICAgKSB7XG4gICAgICByZXR1cm4gZmllbGQ7XG4gICAgfVxuICB9XG4gIHJldHVybiB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIE1vbmdvQ29sbGVjdGlvbiB7XG4gIF9tb25nb0NvbGxlY3Rpb246IENvbGxlY3Rpb247XG5cbiAgY29uc3RydWN0b3IobW9uZ29Db2xsZWN0aW9uOiBDb2xsZWN0aW9uKSB7XG4gICAgdGhpcy5fbW9uZ29Db2xsZWN0aW9uID0gbW9uZ29Db2xsZWN0aW9uO1xuICB9XG5cbiAgLy8gRG9lcyBhIGZpbmQgd2l0aCBcInNtYXJ0IGluZGV4aW5nXCIuXG4gIC8vIEN1cnJlbnRseSB0aGlzIGp1c3QgbWVhbnMsIGlmIGl0IG5lZWRzIGEgZ2VvaW5kZXggYW5kIHRoZXJlIGlzXG4gIC8vIG5vbmUsIHRoZW4gYnVpbGQgdGhlIGdlb2luZGV4LlxuICAvLyBUaGlzIGNvdWxkIGJlIGltcHJvdmVkIGEgbG90IGJ1dCBpdCdzIG5vdCBjbGVhciBpZiB0aGF0J3MgYSBnb29kXG4gIC8vIGlkZWEuIE9yIGV2ZW4gaWYgdGhpcyBiZWhhdmlvciBpcyBhIGdvb2QgaWRlYS5cbiAgZmluZChcbiAgICBxdWVyeSxcbiAgICB7XG4gICAgICBza2lwLFxuICAgICAgbGltaXQsXG4gICAgICBzb3J0LFxuICAgICAga2V5cyxcbiAgICAgIG1heFRpbWVNUyxcbiAgICAgIGJhdGNoU2l6ZSxcbiAgICAgIHJlYWRQcmVmZXJlbmNlLFxuICAgICAgaGludCxcbiAgICAgIGNhc2VJbnNlbnNpdGl2ZSxcbiAgICAgIGV4cGxhaW4sXG4gICAgICBjb21tZW50LFxuICAgIH0gPSB7fVxuICApIHtcbiAgICAvLyBTdXBwb3J0IGZvciBGdWxsIFRleHQgU2VhcmNoIC0gJHRleHRcbiAgICBpZiAoa2V5cyAmJiBrZXlzLiRzY29yZSkge1xuICAgICAgZGVsZXRlIGtleXMuJHNjb3JlO1xuICAgICAga2V5cy5zY29yZSA9IHsgJG1ldGE6ICd0ZXh0U2NvcmUnIH07XG4gICAgfVxuICAgIHJldHVybiB0aGlzLl9yYXdGaW5kKHF1ZXJ5LCB7XG4gICAgICBza2lwLFxuICAgICAgbGltaXQsXG4gICAgICBzb3J0LFxuICAgICAga2V5cyxcbiAgICAgIG1heFRpbWVNUyxcbiAgICAgIGJhdGNoU2l6ZSxcbiAgICAgIHJlYWRQcmVmZXJlbmNlLFxuICAgICAgaGludCxcbiAgICAgIGNhc2VJbnNlbnNpdGl2ZSxcbiAgICAgIGV4cGxhaW4sXG4gICAgICBjb21tZW50LFxuICAgIH0pLmNhdGNoKGVycm9yID0+IHtcbiAgICAgIC8vIENoZWNrIGZvciBcIm5vIGdlb2luZGV4XCIgZXJyb3JcbiAgICAgIGlmIChlcnJvci5jb2RlICE9IDE3MDA3ICYmICFlcnJvci5tZXNzYWdlLm1hdGNoKC91bmFibGUgdG8gZmluZCBpbmRleCBmb3IgLmdlb05lYXIvKSkge1xuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH1cbiAgICAgIC8vIEZpZ3VyZSBvdXQgd2hpY2ggZmllbGQgbmVlZHMgYSBnZW8gaW5kZXguXG4gICAgICAvLyBPbGRlciBNb25nb0RCIGVtYmVkcyB0aGUgZmllbGQgbmFtZSBpbiB0aGUgZXJyb3IgbWVzc2FnZSAoYC4uLiBmaWVsZD08bmFtZT4gLi4uYCk7XG4gICAgICAvLyBNb25nb0RCIDguMysgc2hvcnRlbmVkIHRoZSBtZXNzYWdlIHRvIGB1bmFibGUgdG8gZmluZCBpbmRleCBmb3IgJGdlb05lYXIgcXVlcnlgXG4gICAgICAvLyBhbmQgbm8gbG9uZ2VyIGluY2x1ZGVzIGl0LCBzbyBmYWxsIGJhY2sgdG8gcmVhZGluZyB0aGUgZmllbGQgZnJvbSB0aGUgcXVlcnkgaXRzZWxmLlxuICAgICAgY29uc3QgbWVzc2FnZU1hdGNoID0gZXJyb3IubWVzc2FnZS5tYXRjaCgvZmllbGQ9KFtBLVphLXpfMC05XSspIC8pO1xuICAgICAgY29uc3Qga2V5ID0gKG1lc3NhZ2VNYXRjaCAmJiBtZXNzYWdlTWF0Y2hbMV0pIHx8IGZpbmRHZW9JbmRleEZpZWxkKHF1ZXJ5KTtcbiAgICAgIGlmICgha2V5KSB7XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfVxuXG4gICAgICB2YXIgaW5kZXggPSB7fTtcbiAgICAgIGluZGV4W2tleV0gPSAnMmQnO1xuICAgICAgcmV0dXJuIChcbiAgICAgICAgdGhpcy5fbW9uZ29Db2xsZWN0aW9uXG4gICAgICAgICAgLmNyZWF0ZUluZGV4KGluZGV4KVxuICAgICAgICAgIC8vIFJldHJ5LCBidXQganVzdCBvbmNlLlxuICAgICAgICAgIC50aGVuKCgpID0+XG4gICAgICAgICAgICB0aGlzLl9yYXdGaW5kKHF1ZXJ5LCB7XG4gICAgICAgICAgICAgIHNraXAsXG4gICAgICAgICAgICAgIGxpbWl0LFxuICAgICAgICAgICAgICBzb3J0LFxuICAgICAgICAgICAgICBrZXlzLFxuICAgICAgICAgICAgICBtYXhUaW1lTVMsXG4gICAgICAgICAgICAgIGJhdGNoU2l6ZSxcbiAgICAgICAgICAgICAgcmVhZFByZWZlcmVuY2UsXG4gICAgICAgICAgICAgIGhpbnQsXG4gICAgICAgICAgICAgIGNhc2VJbnNlbnNpdGl2ZSxcbiAgICAgICAgICAgICAgZXhwbGFpbixcbiAgICAgICAgICAgICAgY29tbWVudCxcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgKVxuICAgICAgKTtcbiAgICB9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBDb2xsYXRpb24gdG8gc3VwcG9ydCBjYXNlIGluc2Vuc2l0aXZlIHF1ZXJpZXNcbiAgICovXG4gIHN0YXRpYyBjYXNlSW5zZW5zaXRpdmVDb2xsYXRpb24oKSB7XG4gICAgcmV0dXJuIHsgbG9jYWxlOiAnZW5fVVMnLCBzdHJlbmd0aDogMiB9O1xuICB9XG5cbiAgX3Jhd0ZpbmQoXG4gICAgcXVlcnksXG4gICAge1xuICAgICAgc2tpcCxcbiAgICAgIGxpbWl0LFxuICAgICAgc29ydCxcbiAgICAgIGtleXMsXG4gICAgICBtYXhUaW1lTVMsXG4gICAgICBiYXRjaFNpemUsXG4gICAgICByZWFkUHJlZmVyZW5jZSxcbiAgICAgIGhpbnQsXG4gICAgICBjYXNlSW5zZW5zaXRpdmUsXG4gICAgICBleHBsYWluLFxuICAgICAgY29tbWVudCxcbiAgICB9ID0ge31cbiAgKSB7XG4gICAgbGV0IGZpbmRPcGVyYXRpb24gPSB0aGlzLl9tb25nb0NvbGxlY3Rpb24uZmluZChxdWVyeSwge1xuICAgICAgc2tpcCxcbiAgICAgIGxpbWl0LFxuICAgICAgc29ydCxcbiAgICAgIHJlYWRQcmVmZXJlbmNlLFxuICAgICAgaGludCxcbiAgICAgIGNvbW1lbnQsXG4gICAgICBiYXRjaFNpemUsXG4gICAgfSk7XG5cbiAgICBpZiAoa2V5cykge1xuICAgICAgZmluZE9wZXJhdGlvbiA9IGZpbmRPcGVyYXRpb24ucHJvamVjdChrZXlzKTtcbiAgICB9XG5cbiAgICBpZiAoY2FzZUluc2Vuc2l0aXZlKSB7XG4gICAgICBmaW5kT3BlcmF0aW9uID0gZmluZE9wZXJhdGlvbi5jb2xsYXRpb24oTW9uZ29Db2xsZWN0aW9uLmNhc2VJbnNlbnNpdGl2ZUNvbGxhdGlvbigpKTtcbiAgICB9XG5cbiAgICBpZiAobWF4VGltZU1TKSB7XG4gICAgICBmaW5kT3BlcmF0aW9uID0gZmluZE9wZXJhdGlvbi5tYXhUaW1lTVMobWF4VGltZU1TKTtcbiAgICB9XG5cbiAgICByZXR1cm4gZXhwbGFpbiA/IGZpbmRPcGVyYXRpb24uZXhwbGFpbihleHBsYWluKSA6IGZpbmRPcGVyYXRpb24udG9BcnJheSgpO1xuICB9XG5cbiAgY291bnQocXVlcnksIHsgc2tpcCwgbGltaXQsIHNvcnQsIG1heFRpbWVNUywgcmVhZFByZWZlcmVuY2UsIGhpbnQsIGNvbW1lbnQgfSA9IHt9KSB7XG4gICAgLy8gSWYgcXVlcnkgaXMgZW1wdHksIHRoZW4gdXNlIGVzdGltYXRlZERvY3VtZW50Q291bnQgaW5zdGVhZC5cbiAgICAvLyBUaGlzIGlzIGR1ZSB0byBjb3VudERvY3VtZW50cyBwZXJmb3JtaW5nIGEgc2NhbixcbiAgICAvLyB3aGljaCBncmVhdGx5IGluY3JlYXNlcyBleGVjdXRpb24gdGltZSB3aGVuIGJlaW5nIHJ1biBvbiBsYXJnZSBjb2xsZWN0aW9ucy5cbiAgICAvLyBTZWUgaHR0cHM6Ly9naXRodWIuY29tL0F1dG9tYXR0aWMvbW9uZ29vc2UvaXNzdWVzLzY3MTMgZm9yIG1vcmUgaW5mbyByZWdhcmRpbmcgdGhpcyBwcm9ibGVtLlxuICAgIGlmICh0eXBlb2YgcXVlcnkgIT09ICdvYmplY3QnIHx8ICFPYmplY3Qua2V5cyhxdWVyeSkubGVuZ3RoKSB7XG4gICAgICByZXR1cm4gdGhpcy5fbW9uZ29Db2xsZWN0aW9uLmVzdGltYXRlZERvY3VtZW50Q291bnQoe1xuICAgICAgICBtYXhUaW1lTVMsXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICBjb25zdCBjb3VudE9wZXJhdGlvbiA9IHRoaXMuX21vbmdvQ29sbGVjdGlvbi5jb3VudERvY3VtZW50cyhxdWVyeSwge1xuICAgICAgc2tpcCxcbiAgICAgIGxpbWl0LFxuICAgICAgc29ydCxcbiAgICAgIG1heFRpbWVNUyxcbiAgICAgIHJlYWRQcmVmZXJlbmNlLFxuICAgICAgaGludCxcbiAgICAgIGNvbW1lbnQsXG4gICAgfSk7XG5cbiAgICByZXR1cm4gY291bnRPcGVyYXRpb247XG4gIH1cblxuICBkaXN0aW5jdChmaWVsZCwgcXVlcnkpIHtcbiAgICByZXR1cm4gdGhpcy5fbW9uZ29Db2xsZWN0aW9uLmRpc3RpbmN0KGZpZWxkLCBxdWVyeSk7XG4gIH1cblxuICBhZ2dyZWdhdGUocGlwZWxpbmUsIHsgbWF4VGltZU1TLCBiYXRjaFNpemUsIHJlYWRQcmVmZXJlbmNlLCBoaW50LCBleHBsYWluLCBjb21tZW50IH0gPSB7fSkge1xuICAgIHJldHVybiB0aGlzLl9tb25nb0NvbGxlY3Rpb25cbiAgICAgIC5hZ2dyZWdhdGUocGlwZWxpbmUsIHsgbWF4VGltZU1TLCBiYXRjaFNpemUsIHJlYWRQcmVmZXJlbmNlLCBoaW50LCBleHBsYWluLCBjb21tZW50IH0pXG4gICAgICAudG9BcnJheSgpO1xuICB9XG5cbiAgaW5zZXJ0T25lKG9iamVjdCwgc2Vzc2lvbikge1xuICAgIHJldHVybiB0aGlzLl9tb25nb0NvbGxlY3Rpb24uaW5zZXJ0T25lKG9iamVjdCwgeyBzZXNzaW9uIH0pO1xuICB9XG5cbiAgLy8gQXRvbWljYWxseSB1cGRhdGVzIGRhdGEgaW4gdGhlIGRhdGFiYXNlIGZvciBhIHNpbmdsZSAoZmlyc3QpIG9iamVjdCB0aGF0IG1hdGNoZWQgdGhlIHF1ZXJ5XG4gIC8vIElmIHRoZXJlIGlzIG5vdGhpbmcgdGhhdCBtYXRjaGVzIHRoZSBxdWVyeSAtIGRvZXMgaW5zZXJ0XG4gIC8vIFBvc3RncmVzIE5vdGU6IGBJTlNFUlQgLi4uIE9OIENPTkZMSUNUIFVQREFURWAgdGhhdCBpcyBhdmFpbGFibGUgc2luY2UgOS41LlxuICB1cHNlcnRPbmUocXVlcnksIHVwZGF0ZSwgc2Vzc2lvbikge1xuICAgIHJldHVybiB0aGlzLl9tb25nb0NvbGxlY3Rpb24udXBkYXRlT25lKHF1ZXJ5LCB1cGRhdGUsIHtcbiAgICAgIHVwc2VydDogdHJ1ZSxcbiAgICAgIHNlc3Npb24sXG4gICAgfSk7XG4gIH1cblxuICB1cGRhdGVPbmUocXVlcnksIHVwZGF0ZSkge1xuICAgIHJldHVybiB0aGlzLl9tb25nb0NvbGxlY3Rpb24udXBkYXRlT25lKHF1ZXJ5LCB1cGRhdGUpO1xuICB9XG5cbiAgdXBkYXRlTWFueShxdWVyeSwgdXBkYXRlLCBzZXNzaW9uKSB7XG4gICAgcmV0dXJuIHRoaXMuX21vbmdvQ29sbGVjdGlvbi51cGRhdGVNYW55KHF1ZXJ5LCB1cGRhdGUsIHsgc2Vzc2lvbiB9KTtcbiAgfVxuXG4gIGRlbGV0ZU1hbnkocXVlcnksIHNlc3Npb24pIHtcbiAgICByZXR1cm4gdGhpcy5fbW9uZ29Db2xsZWN0aW9uLmRlbGV0ZU1hbnkocXVlcnksIHsgc2Vzc2lvbiB9KTtcbiAgfVxuXG4gIF9lbnN1cmVTcGFyc2VVbmlxdWVJbmRleEluQmFja2dyb3VuZChpbmRleFJlcXVlc3QpIHtcbiAgICByZXR1cm4gdGhpcy5fbW9uZ29Db2xsZWN0aW9uLmNyZWF0ZUluZGV4KGluZGV4UmVxdWVzdCwge1xuICAgICAgdW5pcXVlOiB0cnVlLFxuICAgICAgYmFja2dyb3VuZDogdHJ1ZSxcbiAgICAgIHNwYXJzZTogdHJ1ZSxcbiAgICB9KTtcbiAgfVxuXG4gIGRyb3AoKSB7XG4gICAgcmV0dXJuIHRoaXMuX21vbmdvQ29sbGVjdGlvbi5kcm9wKCk7XG4gIH1cbn1cbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUFBLE1BQU1BLE9BQU8sR0FBR0MsT0FBTyxDQUFDLFNBQVMsQ0FBQztBQUNsQyxNQUFNQyxVQUFVLEdBQUdGLE9BQU8sQ0FBQ0UsVUFBVTs7QUFFckM7QUFDQTtBQUNBO0FBQ0EsTUFBTUMseUJBQXlCLEdBQUcsQ0FBQyxhQUFhLEVBQUUsT0FBTyxFQUFFLFVBQVUsQ0FBQzs7QUFFdEU7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDTyxTQUFTQyxpQkFBaUJBLENBQUNDLEtBQUssRUFBRTtFQUN2QyxJQUFJLENBQUNBLEtBQUssSUFBSSxPQUFPQSxLQUFLLEtBQUssUUFBUSxFQUFFO0lBQ3ZDLE9BQU9DLFNBQVM7RUFDbEI7RUFDQSxLQUFLLE1BQU1DLEtBQUssSUFBSUMsTUFBTSxDQUFDQyxJQUFJLENBQUNKLEtBQUssQ0FBQyxFQUFFO0lBQ3RDLE1BQU1LLEtBQUssR0FBR0wsS0FBSyxDQUFDRSxLQUFLLENBQUM7SUFDMUI7SUFDQSxJQUFJQSxLQUFLLEtBQUssTUFBTSxJQUFJSSxLQUFLLENBQUNDLE9BQU8sQ0FBQ0YsS0FBSyxDQUFDLEVBQUU7TUFDNUMsS0FBSyxNQUFNRyxRQUFRLElBQUlILEtBQUssRUFBRTtRQUM1QixNQUFNSSxLQUFLLEdBQUdWLGlCQUFpQixDQUFD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