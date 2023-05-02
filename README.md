# VS-Code Editor Extension for TSL-Generator Data Files.

The [TSL-Generator](https://github.com/db-tu-dresden/TVLGen) uses YAML files as the data model. 
As YAML sometimes is hard to debug and maintain, the Editor Extension is meant to be used as a tool that makes life easier.

## Features

Currently, the extension supports the following features:
- Outlining (Adding relevant links of a document to the outline)
- Auto-Completion (providing suggestions of possible keys)
- skeleton-creation (creating object sceletons for complex objects)
- Preview (rendering the currently selected primitive using [ctrl]+[alt]+[p])

### Outlining
![](docu/outline.gif)

### Auto-Completion
![](docu/auto_complete.gif)

### Preview
![](docu/preview.gif)

## Known Issues

Currently, only primitive definitions can be rendered.


### 0.0.1

Initial release.

### Acknowledgments

Thanks to Alexander Krause for getting the web view and rendering up and running. 

Find more interesting research on our [homepage](https://wwwdb.inf.tu-dresden.de/).