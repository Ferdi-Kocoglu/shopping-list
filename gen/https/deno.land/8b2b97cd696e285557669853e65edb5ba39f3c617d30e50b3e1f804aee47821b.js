import { existsSync, path, readFileSync } from "./file-methods.ts";
const _BOM = /^\uFEFF/;
// express is set like: app.engine('html', require('eta').renderFile)
import EtaErr from "./err.ts";
/* END TYPES */ /**
 * Get the path to the included file from the parent file path and the
 * specified path.
 *
 * If `name` does not have an extension, it will default to `.eta`
 *
 * @param name specified path
 * @param parentfile parent file path
 * @param isDirectory whether parentfile is a directory
 * @return absolute path to template
 */ function getWholeFilePath(name, parentfile, isDirectory) {
  const includePath = path.resolve(isDirectory ? parentfile : path.dirname(parentfile), name) + (path.extname(name) ? "" : ".eta");
  return includePath;
}
/**
 * Get the absolute path to an included template
 *
 * If this is called with an absolute path (for example, starting with '/' or 'C:\')
 * then Eta will attempt to resolve the absolute path within options.views. If it cannot,
 * Eta will fallback to options.root or '/'
 *
 * If this is called with a relative path, Eta will:
 * - Look relative to the current template (if the current template has the `filename` property)
 * - Look inside each directory in options.views
 *
 * Note: if Eta is unable to find a template using path and options, it will throw an error.
 *
 * @param path    specified path
 * @param options compilation options
 * @return absolute path to template
 */ function getPath(path, options) {
  let includePath = false;
  const views = options.views;
  const searchedPaths = [];
  // If these four values are the same,
  // getPath() will return the same result every time.
  // We can cache the result to avoid expensive
  // file operations.
  const pathOptions = JSON.stringify({
    filename: options.filename,
    path: path,
    root: options.root,
    views: options.views
  });
  if (options.cache && options.filepathCache && options.filepathCache[pathOptions]) {
    // Use the cached filepath
    return options.filepathCache[pathOptions];
  }
  /** Add a filepath to the list of paths we've checked for a template */ function addPathToSearched(pathSearched) {
    if (!searchedPaths.includes(pathSearched)) {
      searchedPaths.push(pathSearched);
    }
  }
  /**
   * Take a filepath (like 'partials/mypartial.eta'). Attempt to find the template file inside `views`;
   * return the resulting template file path, or `false` to indicate that the template was not found.
   *
   * @param views the filepath that holds templates, or an array of filepaths that hold templates
   * @param path the path to the template
   */ function searchViews(views, path) {
    let filePath;
    // If views is an array, then loop through each directory
    // And attempt to find the template
    if (Array.isArray(views) && views.some(function(v) {
      filePath = getWholeFilePath(path, v, true);
      addPathToSearched(filePath);
      return existsSync(filePath);
    })) {
      // If the above returned true, we know that the filePath was just set to a path
      // That exists (Array.some() returns as soon as it finds a valid element)
      return filePath;
    } else if (typeof views === "string") {
      // Search for the file if views is a single directory
      filePath = getWholeFilePath(path, views, true);
      addPathToSearched(filePath);
      if (existsSync(filePath)) {
        return filePath;
      }
    }
    // Unable to find a file
    return false;
  }
  // Path starts with '/', 'C:\', etc.
  const match = /^[A-Za-z]+:\\|^\//.exec(path);
  // Absolute path, like /partials/partial.eta
  if (match && match.length) {
    // We have to trim the beginning '/' off the path, or else
    // path.resolve(dir, path) will always resolve to just path
    const formattedPath = path.replace(/^\/*/, "");
    // First, try to resolve the path within options.views
    includePath = searchViews(views, formattedPath);
    if (!includePath) {
      // If that fails, searchViews will return false. Try to find the path
      // inside options.root (by default '/', the base of the filesystem)
      const pathFromRoot = getWholeFilePath(formattedPath, options.root || "/", true);
      addPathToSearched(pathFromRoot);
      includePath = pathFromRoot;
    }
  } else {
    // Relative paths
    // Look relative to a passed filename first
    if (options.filename) {
      const filePath = getWholeFilePath(path, options.filename);
      addPathToSearched(filePath);
      if (existsSync(filePath)) {
        includePath = filePath;
      }
    }
    // Then look for the template in options.views
    if (!includePath) {
      includePath = searchViews(views, path);
    }
    if (!includePath) {
      throw EtaErr('Could not find the template "' + path + '". Paths tried: ' + searchedPaths);
    }
  }
  // If caching and filepathCache are enabled,
  // cache the input & output of this function.
  if (options.cache && options.filepathCache) {
    options.filepathCache[pathOptions] = includePath;
  }
  return includePath;
}
/**
 * Reads a file synchronously
 */ function readFile(filePath) {
  try {
    return readFileSync(filePath).toString().replace(_BOM, ""); // TODO: is replacing BOM's necessary?
  } catch  {
    throw EtaErr("Failed to read template at '" + filePath + "'");
  }
}
export { getPath, readFile };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3gvZXRhQHYyLjIuMC9maWxlLXV0aWxzLnRzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IGV4aXN0c1N5bmMsIHBhdGgsIHJlYWRGaWxlU3luYyB9IGZyb20gXCIuL2ZpbGUtbWV0aG9kcy50c1wiO1xuY29uc3QgX0JPTSA9IC9eXFx1RkVGRi87XG5cbi8vIGV4cHJlc3MgaXMgc2V0IGxpa2U6IGFwcC5lbmdpbmUoJ2h0bWwnLCByZXF1aXJlKCdldGEnKS5yZW5kZXJGaWxlKVxuXG5pbXBvcnQgRXRhRXJyIGZyb20gXCIuL2Vyci50c1wiO1xuXG4vKiBUWVBFUyAqL1xuXG5pbXBvcnQgdHlwZSB7IEV0YUNvbmZpZyB9IGZyb20gXCIuL2NvbmZpZy50c1wiO1xuXG4vKiBFTkQgVFlQRVMgKi9cblxuLyoqXG4gKiBHZXQgdGhlIHBhdGggdG8gdGhlIGluY2x1ZGVkIGZpbGUgZnJvbSB0aGUgcGFyZW50IGZpbGUgcGF0aCBhbmQgdGhlXG4gKiBzcGVjaWZpZWQgcGF0aC5cbiAqXG4gKiBJZiBgbmFtZWAgZG9lcyBub3QgaGF2ZSBhbiBleHRlbnNpb24sIGl0IHdpbGwgZGVmYXVsdCB0byBgLmV0YWBcbiAqXG4gKiBAcGFyYW0gbmFtZSBzcGVjaWZpZWQgcGF0aFxuICogQHBhcmFtIHBhcmVudGZpbGUgcGFyZW50IGZpbGUgcGF0aFxuICogQHBhcmFtIGlzRGlyZWN0b3J5IHdoZXRoZXIgcGFyZW50ZmlsZSBpcyBhIGRpcmVjdG9yeVxuICogQHJldHVybiBhYnNvbHV0ZSBwYXRoIHRvIHRlbXBsYXRlXG4gKi9cblxuZnVuY3Rpb24gZ2V0V2hvbGVGaWxlUGF0aChcbiAgbmFtZTogc3RyaW5nLFxuICBwYXJlbnRmaWxlOiBzdHJpbmcsXG4gIGlzRGlyZWN0b3J5PzogYm9vbGVhbixcbik6IHN0cmluZyB7XG4gIGNvbnN0IGluY2x1ZGVQYXRoID0gcGF0aC5yZXNvbHZlKFxuICAgIGlzRGlyZWN0b3J5ID8gcGFyZW50ZmlsZSA6IHBhdGguZGlybmFtZShwYXJlbnRmaWxlKSwgLy8gcmV0dXJucyBkaXJlY3RvcnkgdGhlIHBhcmVudCBmaWxlIGlzIGluXG4gICAgbmFtZSwgLy8gZmlsZVxuICApICsgKHBhdGguZXh0bmFtZShuYW1lKSA/IFwiXCIgOiBcIi5ldGFcIik7XG4gIHJldHVybiBpbmNsdWRlUGF0aDtcbn1cblxuLyoqXG4gKiBHZXQgdGhlIGFic29sdXRlIHBhdGggdG8gYW4gaW5jbHVkZWQgdGVtcGxhdGVcbiAqXG4gKiBJZiB0aGlzIGlzIGNhbGxlZCB3aXRoIGFuIGFic29sdXRlIHBhdGggKGZvciBleGFtcGxlLCBzdGFydGluZyB3aXRoICcvJyBvciAnQzpcXCcpXG4gKiB0aGVuIEV0YSB3aWxsIGF0dGVtcHQgdG8gcmVzb2x2ZSB0aGUgYWJzb2x1dGUgcGF0aCB3aXRoaW4gb3B0aW9ucy52aWV3cy4gSWYgaXQgY2Fubm90LFxuICogRXRhIHdpbGwgZmFsbGJhY2sgdG8gb3B0aW9ucy5yb290IG9yICcvJ1xuICpcbiAqIElmIHRoaXMgaXMgY2FsbGVkIHdpdGggYSByZWxhdGl2ZSBwYXRoLCBFdGEgd2lsbDpcbiAqIC0gTG9vayByZWxhdGl2ZSB0byB0aGUgY3VycmVudCB0ZW1wbGF0ZSAoaWYgdGhlIGN1cnJlbnQgdGVtcGxhdGUgaGFzIHRoZSBgZmlsZW5hbWVgIHByb3BlcnR5KVxuICogLSBMb29rIGluc2lkZSBlYWNoIGRpcmVjdG9yeSBpbiBvcHRpb25zLnZpZXdzXG4gKlxuICogTm90ZTogaWYgRXRhIGlzIHVuYWJsZSB0byBmaW5kIGEgdGVtcGxhdGUgdXNpbmcgcGF0aCBhbmQgb3B0aW9ucywgaXQgd2lsbCB0aHJvdyBhbiBlcnJvci5cbiAqXG4gKiBAcGFyYW0gcGF0aCAgICBzcGVjaWZpZWQgcGF0aFxuICogQHBhcmFtIG9wdGlvbnMgY29tcGlsYXRpb24gb3B0aW9uc1xuICogQHJldHVybiBhYnNvbHV0ZSBwYXRoIHRvIHRlbXBsYXRlXG4gKi9cblxuZnVuY3Rpb24gZ2V0UGF0aChwYXRoOiBzdHJpbmcsIG9wdGlvbnM6IEV0YUNvbmZpZyk6IHN0cmluZyB7XG4gIGxldCBpbmNsdWRlUGF0aDogc3RyaW5nIHwgZmFsc2UgPSBmYWxzZTtcbiAgY29uc3Qgdmlld3MgPSBvcHRpb25zLnZpZXdzO1xuICBjb25zdCBzZWFyY2hlZFBhdGhzOiBBcnJheTxzdHJpbmc+ID0gW107XG5cbiAgLy8gSWYgdGhlc2UgZm91ciB2YWx1ZXMgYXJlIHRoZSBzYW1lLFxuICAvLyBnZXRQYXRoKCkgd2lsbCByZXR1cm4gdGhlIHNhbWUgcmVzdWx0IGV2ZXJ5IHRpbWUuXG4gIC8vIFdlIGNhbiBjYWNoZSB0aGUgcmVzdWx0IHRvIGF2b2lkIGV4cGVuc2l2ZVxuICAvLyBmaWxlIG9wZXJhdGlvbnMuXG4gIGNvbnN0IHBhdGhPcHRpb25zID0gSlNPTi5zdHJpbmdpZnkoe1xuICAgIGZpbGVuYW1lOiBvcHRpb25zLmZpbGVuYW1lLCAvLyBmaWxlbmFtZSBvZiB0aGUgdGVtcGxhdGUgd2hpY2ggY2FsbGVkIGluY2x1ZGVGaWxlKClcbiAgICBwYXRoOiBwYXRoLFxuICAgIHJvb3Q6IG9wdGlvbnMucm9vdCxcbiAgICB2aWV3czogb3B0aW9ucy52aWV3cyxcbiAgfSk7XG5cbiAgaWYgKFxuICAgIG9wdGlvbnMuY2FjaGUgJiYgb3B0aW9ucy5maWxlcGF0aENhY2hlICYmIG9wdGlvbnMuZmlsZXBhdGhDYWNoZVtwYXRoT3B0aW9uc11cbiAgKSB7XG4gICAgLy8gVXNlIHRoZSBjYWNoZWQgZmlsZXBhdGhcbiAgICByZXR1cm4gb3B0aW9ucy5maWxlcGF0aENhY2hlW3BhdGhPcHRpb25zXTtcbiAgfVxuXG4gIC8qKiBBZGQgYSBmaWxlcGF0aCB0byB0aGUgbGlzdCBvZiBwYXRocyB3ZSd2ZSBjaGVja2VkIGZvciBhIHRlbXBsYXRlICovXG4gIGZ1bmN0aW9uIGFkZFBhdGhUb1NlYXJjaGVkKHBhdGhTZWFyY2hlZDogc3RyaW5nKSB7XG4gICAgaWYgKCFzZWFyY2hlZFBhdGhzLmluY2x1ZGVzKHBhdGhTZWFyY2hlZCkpIHtcbiAgICAgIHNlYXJjaGVkUGF0aHMucHVzaChwYXRoU2VhcmNoZWQpO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBUYWtlIGEgZmlsZXBhdGggKGxpa2UgJ3BhcnRpYWxzL215cGFydGlhbC5ldGEnKS4gQXR0ZW1wdCB0byBmaW5kIHRoZSB0ZW1wbGF0ZSBmaWxlIGluc2lkZSBgdmlld3NgO1xuICAgKiByZXR1cm4gdGhlIHJlc3VsdGluZyB0ZW1wbGF0ZSBmaWxlIHBhdGgsIG9yIGBmYWxzZWAgdG8gaW5kaWNhdGUgdGhhdCB0aGUgdGVtcGxhdGUgd2FzIG5vdCBmb3VuZC5cbiAgICpcbiAgICogQHBhcmFtIHZpZXdzIHRoZSBmaWxlcGF0aCB0aGF0IGhvbGRzIHRlbXBsYXRlcywgb3IgYW4gYXJyYXkgb2YgZmlsZXBhdGhzIHRoYXQgaG9sZCB0ZW1wbGF0ZXNcbiAgICogQHBhcmFtIHBhdGggdGhlIHBhdGggdG8gdGhlIHRlbXBsYXRlXG4gICAqL1xuXG4gIGZ1bmN0aW9uIHNlYXJjaFZpZXdzKFxuICAgIHZpZXdzOiBBcnJheTxzdHJpbmc+IHwgc3RyaW5nIHwgdW5kZWZpbmVkLFxuICAgIHBhdGg6IHN0cmluZyxcbiAgKTogc3RyaW5nIHwgZmFsc2Uge1xuICAgIGxldCBmaWxlUGF0aDtcblxuICAgIC8vIElmIHZpZXdzIGlzIGFuIGFycmF5LCB0aGVuIGxvb3AgdGhyb3VnaCBlYWNoIGRpcmVjdG9yeVxuICAgIC8vIEFuZCBhdHRlbXB0IHRvIGZpbmQgdGhlIHRlbXBsYXRlXG4gICAgaWYgKFxuICAgICAgQXJyYXkuaXNBcnJheSh2aWV3cykgJiZcbiAgICAgIHZpZXdzLnNvbWUoZnVuY3Rpb24gKHYpIHtcbiAgICAgICAgZmlsZVBhdGggPSBnZXRXaG9sZUZpbGVQYXRoKHBhdGgsIHYsIHRydWUpO1xuXG4gICAgICAgIGFkZFBhdGhUb1NlYXJjaGVkKGZpbGVQYXRoKTtcblxuICAgICAgICByZXR1cm4gZXhpc3RzU3luYyhmaWxlUGF0aCk7XG4gICAgICB9KVxuICAgICkge1xuICAgICAgLy8gSWYgdGhlIGFib3ZlIHJldHVybmVkIHRydWUsIHdlIGtub3cgdGhhdCB0aGUgZmlsZVBhdGggd2FzIGp1c3Qgc2V0IHRvIGEgcGF0aFxuICAgICAgLy8gVGhhdCBleGlzdHMgKEFycmF5LnNvbWUoKSByZXR1cm5zIGFzIHNvb24gYXMgaXQgZmluZHMgYSB2YWxpZCBlbGVtZW50KVxuICAgICAgcmV0dXJuIGZpbGVQYXRoIGFzIHVua25vd24gYXMgc3RyaW5nO1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIHZpZXdzID09PSBcInN0cmluZ1wiKSB7XG4gICAgICAvLyBTZWFyY2ggZm9yIHRoZSBmaWxlIGlmIHZpZXdzIGlzIGEgc2luZ2xlIGRpcmVjdG9yeVxuICAgICAgZmlsZVBhdGggPSBnZXRXaG9sZUZpbGVQYXRoKHBhdGgsIHZpZXdzLCB0cnVlKTtcblxuICAgICAgYWRkUGF0aFRvU2VhcmNoZWQoZmlsZVBhdGgpO1xuXG4gICAgICBpZiAoZXhpc3RzU3luYyhmaWxlUGF0aCkpIHtcbiAgICAgICAgcmV0dXJuIGZpbGVQYXRoO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIFVuYWJsZSB0byBmaW5kIGEgZmlsZVxuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIC8vIFBhdGggc3RhcnRzIHdpdGggJy8nLCAnQzpcXCcsIGV0Yy5cbiAgY29uc3QgbWF0Y2ggPSAvXltBLVphLXpdKzpcXFxcfF5cXC8vLmV4ZWMocGF0aCk7XG5cbiAgLy8gQWJzb2x1dGUgcGF0aCwgbGlrZSAvcGFydGlhbHMvcGFydGlhbC5ldGFcbiAgaWYgKG1hdGNoICYmIG1hdGNoLmxlbmd0aCkge1xuICAgIC8vIFdlIGhhdmUgdG8gdHJpbSB0aGUgYmVnaW5uaW5nICcvJyBvZmYgdGhlIHBhdGgsIG9yIGVsc2VcbiAgICAvLyBwYXRoLnJlc29sdmUoZGlyLCBwYXRoKSB3aWxsIGFsd2F5cyByZXNvbHZlIHRvIGp1c3QgcGF0aFxuICAgIGNvbnN0IGZvcm1hdHRlZFBhdGggPSBwYXRoLnJlcGxhY2UoL15cXC8qLywgXCJcIik7XG5cbiAgICAvLyBGaXJzdCwgdHJ5IHRvIHJlc29sdmUgdGhlIHBhdGggd2l0aGluIG9wdGlvbnMudmlld3NcbiAgICBpbmNsdWRlUGF0aCA9IHNlYXJjaFZpZXdzKHZpZXdzLCBmb3JtYXR0ZWRQYXRoKTtcbiAgICBpZiAoIWluY2x1ZGVQYXRoKSB7XG4gICAgICAvLyBJZiB0aGF0IGZhaWxzLCBzZWFyY2hWaWV3cyB3aWxsIHJldHVybiBmYWxzZS4gVHJ5IHRvIGZpbmQgdGhlIHBhdGhcbiAgICAgIC8vIGluc2lkZSBvcHRpb25zLnJvb3QgKGJ5IGRlZmF1bHQgJy8nLCB0aGUgYmFzZSBvZiB0aGUgZmlsZXN5c3RlbSlcbiAgICAgIGNvbnN0IHBhdGhGcm9tUm9vdCA9IGdldFdob2xlRmlsZVBhdGgoXG4gICAgICAgIGZvcm1hdHRlZFBhdGgsXG4gICAgICAgIG9wdGlvbnMucm9vdCB8fCBcIi9cIixcbiAgICAgICAgdHJ1ZSxcbiAgICAgICk7XG5cbiAgICAgIGFkZFBhdGhUb1NlYXJjaGVkKHBhdGhGcm9tUm9vdCk7XG5cbiAgICAgIGluY2x1ZGVQYXRoID0gcGF0aEZyb21Sb290O1xuICAgIH1cbiAgfSBlbHNlIHtcbiAgICAvLyBSZWxhdGl2ZSBwYXRoc1xuICAgIC8vIExvb2sgcmVsYXRpdmUgdG8gYSBwYXNzZWQgZmlsZW5hbWUgZmlyc3RcbiAgICBpZiAob3B0aW9ucy5maWxlbmFtZSkge1xuICAgICAgY29uc3QgZmlsZVBhdGggPSBnZXRXaG9sZUZpbGVQYXRoKHBhdGgsIG9wdGlvbnMuZmlsZW5hbWUpO1xuXG4gICAgICBhZGRQYXRoVG9TZWFyY2hlZChmaWxlUGF0aCk7XG5cbiAgICAgIGlmIChleGlzdHNTeW5jKGZpbGVQYXRoKSkge1xuICAgICAgICBpbmNsdWRlUGF0aCA9IGZpbGVQYXRoO1xuICAgICAgfVxuICAgIH1cbiAgICAvLyBUaGVuIGxvb2sgZm9yIHRoZSB0ZW1wbGF0ZSBpbiBvcHRpb25zLnZpZXdzXG4gICAgaWYgKCFpbmNsdWRlUGF0aCkge1xuICAgICAgaW5jbHVkZVBhdGggPSBzZWFyY2hWaWV3cyh2aWV3cywgcGF0aCk7XG4gICAgfVxuICAgIGlmICghaW5jbHVkZVBhdGgpIHtcbiAgICAgIHRocm93IEV0YUVycihcbiAgICAgICAgJ0NvdWxkIG5vdCBmaW5kIHRoZSB0ZW1wbGF0ZSBcIicgKyBwYXRoICsgJ1wiLiBQYXRocyB0cmllZDogJyArXG4gICAgICAgICAgc2VhcmNoZWRQYXRocyxcbiAgICAgICk7XG4gICAgfVxuICB9XG5cbiAgLy8gSWYgY2FjaGluZyBhbmQgZmlsZXBhdGhDYWNoZSBhcmUgZW5hYmxlZCxcbiAgLy8gY2FjaGUgdGhlIGlucHV0ICYgb3V0cHV0IG9mIHRoaXMgZnVuY3Rpb24uXG4gIGlmIChvcHRpb25zLmNhY2hlICYmIG9wdGlvbnMuZmlsZXBhdGhDYWNoZSkge1xuICAgIG9wdGlvbnMuZmlsZXBhdGhDYWNoZVtwYXRoT3B0aW9uc10gPSBpbmNsdWRlUGF0aDtcbiAgfVxuXG4gIHJldHVybiBpbmNsdWRlUGF0aDtcbn1cblxuLyoqXG4gKiBSZWFkcyBhIGZpbGUgc3luY2hyb25vdXNseVxuICovXG5cbmZ1bmN0aW9uIHJlYWRGaWxlKGZpbGVQYXRoOiBzdHJpbmcpOiBzdHJpbmcge1xuICB0cnkge1xuICAgIHJldHVybiByZWFkRmlsZVN5bmMoZmlsZVBhdGgpLnRvU3RyaW5nKCkucmVwbGFjZShfQk9NLCBcIlwiKTsgLy8gVE9ETzogaXMgcmVwbGFjaW5nIEJPTSdzIG5lY2Vzc2FyeT9cbiAgfSBjYXRjaCB7XG4gICAgdGhyb3cgRXRhRXJyKFwiRmFpbGVkIHRvIHJlYWQgdGVtcGxhdGUgYXQgJ1wiICsgZmlsZVBhdGggKyBcIidcIik7XG4gIH1cbn1cblxuZXhwb3J0IHsgZ2V0UGF0aCwgcmVhZEZpbGUgfTtcbiJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxTQUFTLFVBQVUsRUFBRSxJQUFJLEVBQUUsWUFBWSxRQUFRLG9CQUFvQjtBQUNuRSxNQUFNLE9BQU87QUFFYixxRUFBcUU7QUFFckUsT0FBTyxZQUFZLFdBQVc7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