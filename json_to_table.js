const fs = require("fs");

/*
❗❗❗❗❗❗❗❗
If the JSON is irregular this script will not work properly.
Caveat emptor.
*/

////////////////////////////////////////////////////////////////////////////////
/*
Change these constants to change
- which part of the JSON you want to parse
- how many rows you want (practical for testing)
- whether you want to rename any columns
- which columns you want to skip
*/

// Show debugging info after each step.
const DEBUG = true;
const log = (data) => {
  if (!DEBUG) return;
  console.log("DEBUG:", data);
};

// Where is your JSON file?
// Example:
// const filePath = "./video.json";
const filePath = "./video.json";

// Where is the data in your JSON?
// Give a list of keys to find the array of records you want to convert into a
// table.
// Example:
// const dataRoot = ["formats"][0]["codecs"];
const dataRoot = ["formats"];

// These constants determine whether you want to use all/most columns or just a
// few.
const useMostOrAll = false;
// Which record columns do you want to exclude?
// Only useful when: useMostOrAll = true
// Example:
const excludeColumns = [];
// const excludeColumns = ["year", "hour"];
// Which record columns do you want to include?
// Only useful when: useMostOrAll = false
// const includeColumns = ["productId", "price"];
// const includeColumns = [];
const includeColumns = ["format_id", "ext", "width", "height", "resolution"];

// Rename columns.
// If this is false: don't rename.
// If this is an array it's a replace-by-index.
// If this is an object the key is the original name and the attribute the
// new name.
// Examples:
// const names = false; // Don't rename.
// const names = ["a", "b", "c", "d", "e", "f"];
// const names = { productId: "id", price: "price in euro" };
const names = { format_id: "id" };

// TODO: Flatten records

////////////////////////////////////////////////////////////////////////////////
// Utility functions

//Produces: "object", "array", "arguments", "error", "date", "regexp", "math",
// "json", "number", "string" or "boolean"
const toType = (obj) =>
  ({}.toString
    .call(obj)
    .match(/\s([a-zA-Z]+)/)[1]
    .toLowerCase());

const formatWordList = (arr) => ["", ...arr].join("\n- ");

// Can handle arrays and sets.
const getSetDifference = (collectionA, collectionB) => {
  // Convert to sets to get rid of duplicates.
  const setA = new Set(collectionA),
    setB = new Set(collectionB);
  return [...setA].filter((item) => !setB.has(item));
};

////////////////////////////////////////////////////////////////////////////////
const getRecords = (json, dataRoot) => {
  if (dataRoot.length === 0) return json;

  let data = json;
  dataRoot.forEach((key) => {
    data = json[key];
  });
  return data;
};

const checkIfColumnsExist = (records, columns) => {
  // We assume that each record has the same columns.
  const record = records[0];
  const keys = new Set(Object.keys(record));
  const nonMatchingColumns = getSetDifference(columns, keys);

  if (nonMatchingColumns.length > 0) {
    const nonMatchingColumnsPrinted = formatWordList(nonMatchingColumns);
    // Sort makes it easier to read.
    const keysSorted = [...keys].sort();
    const differencePrinted = formatWordList(keysSorted);
    throw new Error(
      `Not all given columns were found in the columns of the record:
\nNon-found columns: ${nonMatchingColumnsPrinted}
\nRecord columns: ${differencePrinted}`,
    );
  }
};

const deleteKeys = (obj, keys) => {
  let result = { ...obj };
  for (let key of keys) {
    delete result[key];
  }
  // Check if there are keys left.
  if (Object.keys(result).length === 0) {
    throw new Error("All columns have been excluded.");
  }
  return result;
};

const keepKeys = (obj, keys) => {
  let result = {};
  for (let key of keys) {
    result[key] = obj[key];
  }
  return result;
};

const filterColumnsExclude = (records, excludeColumns) =>
  records.map((record) => deleteKeys(record, excludeColumns));

const filterColumnsInclude = (records, includeColumns) =>
  records.map((record) => keepKeys(record, includeColumns));

const filterColumns = (
  records,
  useMostOrAll,
  excludeColumns,
  includeColumns,
) => {
  if (!useMostOrAll && includeColumns.length === 0) {
    throw new Error(
      "When useMostOrAll is false please supply at least one column to include.",
    );
  }
  if (!useMostOrAll && excludeColumns.length > 0) {
    // Let's be helpful.
    console.info(
      "Selecting columns based on 'includeColumns', explicitly not using 'excludeColumns'.",
    );
  }
  if (useMostOrAll && includeColumns.length > 0) {
    // Let's be helpful.
    console.info(
      "Selecting columns based on 'excludeColumns', explicitly not using 'includeColumns'.",
    );
  }

  checkIfColumnsExist(records, excludeColumns.concat(includeColumns));

  return useMostOrAll
    ? filterColumnsExclude(records, excludeColumns)
    : filterColumnsInclude(records, includeColumns);
};

const renameColumnsIndex = (records, names) => {
  if (names.length === 0) {
    throw new Error("renameColumns needs to have at least one column name");
  }
  const columnsSource = Object.keys(records[0]);
  if (columnsSource.length !== names.length) {
    throw new Error(
      `renameColumns needs to have a column name for every column found.
Columns in source (${columnsSource.length}): ${formatWordList(columnsSource)}.
New column names given: (${names.length}): ${formatWordList(names)}.
`,
    );
  }

  // TODO: improve performance by using different datastructures.
  return records.map((record) => {
    // TODO: There's probably a nicer way to do this.
    const renamed = {};
    let index = 0;
    for (let name of names) {
      renamed[name] = record[columnsSource[index]];
      index++;
    }
    return renamed;
  });
};
const renameColumnsReplace = (records, names) => {
  if (Object.keys(names).length === 0) {
    throw new Error("renameColumns needs to rename at least one column");
  }
  // Do all columns that need to be renamed actually exist?
  const columnsSource = Object.keys(records[0]);
  const columnsTarget = Object.keys(names);
  const missingColumnsInSource = getSetDifference(columnsTarget, columnsSource);
  if (missingColumnsInSource.length > 0) {
    throw new Error(
      `The following columns you want to rename do not exist in the source data: ${formatWordList(
        missingColumnsInSource,
      )}\n Source columns are: ${formatWordList(
        columnsSource,
      )}\n You listed the following as columns to rename: ${formatWordList(
        columnsTarget,
      )}`,
    );
  }

  return records.map((record) => {
    for (let colName of columnsTarget) {
      const value = record[colName];
      delete record[colName];
      record[names[colName]] = value;
    }
    return record;
  });
};

const renameColumns = (records, names) => {
  const namesType = toType(names);
  if (namesType === "boolean" && !names) return records;
  if (namesType === "array") return renameColumnsIndex(records, names);
  if (namesType === "object") return renameColumnsReplace(records, names);
  throw new Error("I don't understand the renameColumns setting.");
};

const valueToString = (value) => {
  const valueType = toType(value);
  if (["null", "undefined"].includes(valueType)) return "";
  return String(value);
};

const generateMarkdownRow = (widths, values) => {
  const colDivider = "|";
  let row = "";
  row += colDivider + " ";
  values = values.map((value, index) => {
    return valueToString(value).padEnd(widths[index]);
  });
  row += values.join(` ${colDivider} `);
  row += " " + colDivider;
  return row;
};

const getValueWidth = (value) => {
  return valueToString(value).length;
};

const getColWidths = (records) => {
  // Headers
  let widths = Object.keys(records[0]).map((colName) => colName.length);

  // All values
  return records.reduce((all, current) => {
    const values = Object.values(current);
    for (let i = 0; i <= all.length; i++) {
      const widthOfValue = getValueWidth(values[i]);
      if (widthOfValue > all[i]) all[i] = widthOfValue;
    }
    return all;
  }, widths);
};

const generateMarkdownTable = (records) => {
  /*
  | First name | Last name |
  | ---------- | --------- |
  | Max        | Planck    |
  | Marie      | Curie     |
  */
  let table = "";

  // Find the widest value for each column.
  const widths = getColWidths(records);

  // First do the header.
  const columnHeaders = Object.keys(records[0]);
  table += `${generateMarkdownRow(widths, columnHeaders)}\n`;

  // Divider
  const dividerValues = widths.map((width) => "-".repeat(width));
  table += `${generateMarkdownRow(widths, dividerValues)}\n`;

  for (let record of records) {
    table += `${generateMarkdownRow(widths, Object.values(record))}\n`;
  }

  // Then all records.
  return table;
};

////////////////////////////////////////////////////////////////////////////////
// The script starts here
log("🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀");
try {
  const json = JSON.parse(fs.readFileSync(filePath));
  const records = getRecords(json, dataRoot);
  log(`Found ${records.length} records.`);
  if (records.length === 0) {
    throw new Error("Found 0 records.");
  }
  // log(Object.keys(records[20]));
  log(records[20]);
  const recordsWithFilteredColumns = filterColumns(
    records,
    useMostOrAll,
    excludeColumns,
    includeColumns,
  );
  // log(recordsWithFilteredColumns[0]);
  const renamed = renameColumns(recordsWithFilteredColumns, names);
  log(renamed[20]);
  const table = generateMarkdownTable(renamed);
  console.log(table);
} catch (err) {
  console.error(err.name + ": " + err.message);
}
