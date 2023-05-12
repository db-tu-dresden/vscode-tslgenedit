# VS-Code Editor Extension for TSL-Generator Data Files.

The [TSL-Generator](https://github.com/db-tu-dresden/TVLGen) uses YAML files as the data model. 
As YAML sometimes is hard to debug and maintain, the Editor Extension is meant to be used as a tool that makes life easier.

## Features

Currently, the extension supports the following features:

### __New File Creation Wizard__

Adding new data files to the TSL Generator folder.

![](docu/new_file.gif)

### __Focus-Mode__

Hide all TSL Generator directories and files which are not relevant for you.

![](docu/focus.gif)

### __Outlining__

Add relevant links of a document to the outline

![](docu/outline.gif)

### __Auto-Completion__

Get suggestions for possible keys. Create object sceletons for complex objects

![](docu/autocomplete.gif)

### __Sort Data File__

Sort file on [Primitive Name], sort definitions on [Extension and Flags].

![](docu/sort.gif)

### __Ad-Hoc Preview__

Render the currently selected primitive.

![](docu/ad_hoc_preview.gif)

### __Build and Test__

Generate the necessary code for a single primitive and execute associated tests.

![](docu/build_and_test.gif)

## Known Issues

- /

## Version History

### 0.1.2

- Fixed preview (escaped html tags)
- Fixed twig template generation
- Improved generation (generator is started once and subsequently asked to generate only a portion)
- Added Diagnostics

### 0.1.1

- Added Building and Testing capabilities
- Improved auto-completion

### 0.1.0

- Preview rendering works for primitive-declaration, primitive-definition(s) and extension

### 0.0.5

- Added Sorting of Primitives in a TSL Primitive Data File.
- Added Formating a TSL Data File.

### 0.0.4

- Added Focus-Mode.
- Added command to create new data files.
- Optimized Preview rendering.

### 0.0.3

- Refactored Library name from TVL to TSL.

### 0.0.2

- Improved Preview.

### 0.0.1

- Initial release.


## Acknowledgments

Thanks to Alexander Krause for getting the web view and rendering up and running. 

Find more interesting research on our [homepage](https://wwwdb.inf.tu-dresden.de/).