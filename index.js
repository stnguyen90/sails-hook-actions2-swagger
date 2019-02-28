let swaggerConfig = require('./swagger');
module.exports = function swaggerGenerator(sails) {
  return {
    initialize: async function () {
      var eventsToWaitFor = [];
      if (sails.hooks.orm) {
        eventsToWaitFor.push("hook:orm:loaded");
      }

      if (sails.hooks.pubsub) {
        eventsToWaitFor.push("hook:pubsub:loaded");
      }
      sails.after(eventsToWaitFor, function () {
        init();
      });
    }
  };
  
  function init() {
    // getting global object if defined
    if (sails.config.swaggerConfig) {
      swaggerConfig = sails.config.swaggerConfig;
    }

    if (swaggerConfig.disable) {
      sails.log.info('Swagger hook disabled, please enable it from sails.config.swaggerConfig.disable')
      return;
    }
    sails.log.info(" 🍺   Logistic Infotech's sails-hook-actions2-swagger loaded 🍺  ");

    let swagger = swaggerConfig.swagger;
    let routeList = sails.config.routes;
    let controllerPath = sails.config.paths.controllers;

    for (const key in routeList) {
      if (routeList.hasOwnProperty(key)) {
        let methodType = key.split(/ (.+)/)[0].toLowerCase();
        let routeUrl = key.split(/ (.+)/)[1];
	if (routeUrl) { routeUrl = routeUrl.trimLeft() }
	
        // if route has path params
        let pathInputs = [];
        let objUrl = {};
        if (routeUrl && routeUrl.indexOf(':') > -1) {
          objUrl = addCurlyToRoute(routeUrl);
          routeUrl = objUrl.routeUrl;
          pathInputs = objUrl.pathInputs;
        }
        //

        if (routeList[key].controller && routeList[key].swagger) {
        
          let tempObj = {
            [methodType]: routeList[key].swagger
          }
          swagger.paths[routeUrl] = tempObj;

	} else if (routeList[key].indexOf && routeList[key].indexOf('Controller.' > -1)) {
	  const controllerName = routeList[key].slice(0, routeList[key].indexOf('.'))
	  const action = routeList[key].slice(routeList[key].indexOf('.') + 1)
	  const filePathToRead = controllerPath + '/' + controllerName
	  
	  let controller
	  try {
	    controller = require(filePathToRead)
	  }
	  catch (err) {
	    continue
	  }
	  
	  objUrl.methodType = methodType
	  objUrl.actionInputs = controller[action].inputs ? controller[action].inputs : []
	  objUrl.tag = controllerName
	  objUrl.summary = controller[action].description
	  objUrl.consumes = objUrl.actionInputs[0] ? ['application/json'] : []
	  objUrl.produces = ['application/json']
	  objUrl.responses = formatExits(controller[action].exits)
	  
	  //objUrl.security = controller[action].security

	  if (swagger.paths[routeUrl]) {
	    swagger.paths[routeUrl] = { ...swagger.paths[routeUrl], ...generatePath(objUrl) }
	  } else {
	    swagger.paths[routeUrl] = generatePath(objUrl)
	  }
	  
	  
	} else if (routeList[key].controller && routeList[key].action) {
	  let controllerName = routeList[key].controller
	  
	  if (controllerName.indexOf('Controller') < 0) {
	    controllerName =
		  controllerName.charAt(0).toUpperCase() +
		  controllerName.slice(1) +
		  'Controller'
	  }

	  const filePathToRead = controllerPath + '/' + controllerName
	  
	  let controller
	  try {
	    controller = require(filePathToRead)
	  }
	  catch (err) {
	    continue
	  }
	  
	  const action = routeList[key].action

	  objUrl.methodType = methodType
	  objUrl.actionInputs = controller[action].inputs ? controller[action].inputs : []
	  objUrl.tag = controllerName
	  objUrl.summary = controller[action].description
	  objUrl.consumes = objUrl.actionInputs[0] ? ['application/json'] : []
	  objUrl.produces = ['application/json']
	  objUrl.responses = formatExits(controller[action].exits)
	  //objUrl.security = controller[action].security

	  if (swagger.paths[routeUrl]) {
	    swagger.paths[routeUrl] = { ...swagger.paths[routeUrl], ...generatePath(objUrl) }
	  } else {
	    swagger.paths[routeUrl] = generatePath(objUrl)
	  }

	  
        } else if (!routeList[key].controller && routeList[key].action) {
          let filePathToRead = controllerPath + "/" + routeList[key].action;
          let actionInputs = getInputs(filePathToRead);
          let tags = routeList[key].action.split("/");


          //   TODO:
          let summary = routeList[key].description ? routeList[key].description : '';
          //
	  
          if (methodType && routeUrl && tags && tags.length > 0) {
            let tag = tags[0];

            if (!tags[1]) {
              tag = "/";
            }

            objUrl.methodType = methodType;
            objUrl.actionInputs = actionInputs;
            objUrl.tag = tag;
            objUrl.summary = summary;
            objUrl.consumes = ["application/json"];
            objUrl.produces = ["application/json"];
            objUrl.responses = swaggerConfig.defaults.responses;
            objUrl.security = swaggerConfig.defaults.security;

            if (routeList[key].swagger && routeList[key].swagger.urlData) {
              objUrl = setDataFromRouteObj(routeList[key].swagger.urlData, objUrl);
            }
            swagger.paths[routeUrl] = generatePath(objUrl);
	 
          }
        }
      }
    }
    swagger.components.schemas = generateDefinitions();
    generateFile(swagger);
  }

  function formatExits(exits) {
    const obj = {}
    for (key in exits) {
      if (exits.hasOwnProperty(key)) {
	const code = exits[key].statusCode
	if (code) {
	  obj[code] = exits[key]
	} else {
	  obj[key] = exits[key]
	}
      }
    }

    return obj
  }
  
  function setDataFromRouteObj(urlData, objUrl) {
    if (urlData.tag) {
      objUrl.tag = urlData.tag;
    }
    if (urlData.summary) {
      objUrl.summary = urlData.summary;
    }
    if (urlData.consumes) {
      objUrl.consumes = urlData.consumes;
    }
    if (urlData.produces) {
      objUrl.produces = urlData.produces;
    }
    if (urlData.responses) {
      objUrl.responses = urlData.responses;
    }
    if (urlData.security) {
      urlData.security = urlData.security;
    }
    return objUrl;
  }

  function addCurlyToRoute(routeUrl) {
    // if route has ':id' then we have to convert it to {id}
    let urlArray = routeUrl.split(':');
    let objUrl = {
      routeUrl: '',
      pathInputs: [],
      originalUrl: routeUrl
    }
    for (i = 0; i < urlArray.length; i++) {
      if (i == 0) {
        objUrl.routeUrl = urlArray[i];
      } else {
        objUrl.pathInputs.push(urlArray[i].split('/')[0]);
        if (i == urlArray.length - 1) {
          objUrl.routeUrl = objUrl.routeUrl + '{' + (urlArray[i]).split('/')[0] + '}';
        } else {
          objUrl.routeUrl = objUrl.routeUrl + '{' + (urlArray[i]).split('/')[0] + '}' + '/';
        }
      }
    }
    return objUrl;
  }

  function parseBodySchema(schema) {
    // schema is the type object defined in Controller.action.inputs[param].type
    if (typeof schema === 'string') {
      return {
	type: schema
      }
    } else if (Array.isArray(schema)) {
      return {
	type: 'array',
	items: parseBodySchema(schema[0])
      }
    } else if (typeof schema === 'object') {
      const obj = {
	type: 'object',
	properties: {}
      }

      for (key in schema) {
	
	if (schema.hasOwnProperty(key)) {
	  obj.properties[key] = parseBodySchema(schema[key])
	}
      }

      return obj
    }
  }
  
  function generatePath(objUrl) {
    // get only the first instance of our space splitting
    let params = {};
    let obj = {};

    const pathInputs = {}
    const actionInputs = objUrl.actionInputs ? objUrl.actionInputs : {}
    if (objUrl.pathInputs && objUrl.pathInputs.length) {
      for (let i = 0; i < objUrl.pathInputs.length; i++) {
        for (const key in actionInputs) {
          if (actionInputs.hasOwnProperty(key)) {
            if (key == objUrl.pathInputs[i]) {
              pathInputs[key] = actionInputs[key]
	      hasPathInputs = true
	      delete actionInputs[key]
	    }
          }
        }
      }
    }

    //pathInputs = Object.assign({}, ...pathInputs);
    //params = generatePathData(pathInputs, 'path');
    
    let path = {
      [objUrl.methodType]: {
        tags: [objUrl.tag],
        summary: objUrl.summary,
        consumes: objUrl.consumes,
        produces: objUrl.produces,
        responses: objUrl.responses,
        security: objUrl.security
      }
    };

    if (Object.keys(actionInputs).length > 0) {
      path[objUrl.methodType].requestBody = generateBodyData(actionInputs)
    }

    if (Object.keys(pathInputs).length > 0) {
      path[objUrl.methodType].parameters = generatePathData(pathInputs, 'path')
    }
    
    //if (objUrl.methodType == "post" || objUrl.methodType == "put") {
    //  obj = generateBodyData(objUrl.actionInputs);
      //params.push(obj);
    //} else {
    //  params = generatePathData(objUrl.actionInputs, 'query');
    //}

    //if (params.length > 0 && params[0] != null) {
    //  path[objUrl.methodType].parameters = params;
    //}
    return path;
  }

  function generatePathData(actionInputs, type) {
    let obj = [];
    for (const key in actionInputs) {
      if (actionInputs.hasOwnProperty(key)) {
        let tempObj = {
          "in": type,
          name: key,
          required: actionInputs[key].required ? actionInputs[key].required : false,
          schema: {
	    type: actionInputs[key].type ? actionInputs[key].type : ''
	  },
          description: actionInputs[key].description ? actionInputs[key].description : ''
        };
        obj.push(tempObj);
      }
    }
    return obj;
  }

  function generateBodyData(actionInputs) {
/*    let obj = {
      //name: "body",
      //in: "body",
      required: true,
      description: "An object defining our schema for this request",
      content: {
	'application/json': {
	  schema: {
            properties: {},
            required: []
	  }
	}
      }
    };
    for (const key in actionInputs) {
      if (actionInputs.hasOwnProperty(key)) {
        obj.content['application/json'].schema.properties[key] = {
          type: actionInputs[key].type,
	  description: actionInputs[key].description
        };

	if (Array.isArray(actionInputs[key].type)) {
	  obj.content['application/json'].schema.properties[key].type = 'array'
	  obj.content['application/json'].schema.properties[key].items = {
	    type: actionInputs[key].type[0]
	  }
	}
        if (actionInputs[key].required) {
          obj.content['application/json'].schema.required.push(key);
        }
      }
    }
    return obj;*/
    const schema_obj = {}
    for (key in actionInputs) {
      if (actionInputs.hasOwnProperty(key)) {
	schema_obj[key] = parseBodySchema(actionInputs[key].type)
      }
    }
    
    return {
      required: true,
      description: 'An object defining our schema for this request',
      content: {
	'application/json': {
	  schema: {
	    type: 'object',
	    properties: schema_obj
	  }
	}
      }
    }
  }

  function generateDefinitions() {
    let models = sails.models;
    let defintions = {};
    for (const key in models) {
      //   if (key === 'archive') {
      //     continue;
      //   }
      if (models.hasOwnProperty(key)) {
        let model = models[key];
        if (model.globalId) {
          let objModel = addOnlySpecificKeys(model.attributes);
          defintions[model.identity] = {
            properties: objModel.attributes,
            required: objModel.required
          };
        }
      }
    }
    return defintions;
  }

  function generateFile(data) {
    let fs = require("fs");

    // generating folder if not exists
    swaggerConfig.pathToGenerateFile = 'assets/swagger/';
    swaggerConfig.fileName = 'swagger.json';
    let folders = swaggerConfig.pathToGenerateFile.split('/');
    let tempPath = '';
    for (let i = 0; i < folders.length; i++) {
      if (folders[i] != '') {
        tempPath = tempPath + folders[i] + '/';

        if (!fs.existsSync(tempPath)) {
          var oldmask = process.umask(0);
          //   fs.mkdirSync(path, { recursive: true })
          fs.mkdir(tempPath, '0755', function (err) {
            process.umask(oldmask);
            if (err) {
              console.log('generateFile =>', err);
            }
          });
        }
      }
    }
    let fullPath = sails.config.appPath + '/' + swaggerConfig.pathToGenerateFile + swaggerConfig.fileName;
    // let fullPath = sails.config.assets + 'assets/swagger/swagger.json';

    fs.writeFile(fullPath, JSON.stringify(data), function (err) {
      if (err) {
        return console.log(err);
      }
      console.log("Cheers 🍺  Swagger JSON generated at ", fullPath, ' access it with /swagger ');
    });

    let htmlFilePath = sails.config.appPath + '/' + swaggerConfig.pathToGenerateFile + 'index.html';

    // copying html file
    fs.copyFile(__dirname + '/index.html', htmlFilePath, true, (err) => {
      if (err) {
        if (err.code != 'EEXIST') {
          return console.log(err);
        }
        return;
      };
      console.log('htmlFilePath');
    });
  }

  function addOnlySpecificKeys(object) {
    let objModel = {
      attributes: {},
      required: []
    };
    for (const key in object) {
      if (object.hasOwnProperty(key)) {
        // creating defintions.required array here
        if (object[key].required) {
          objModel.required.push(key);
        }
        objModel.attributes[key] = {};
        if (object[key].type) {
          if (object[key].type == 'json') {
            object[key].type = 'object'
          }
          objModel.attributes[key].type = object[key].type;
        }
        if (object[key].description) {
          objModel.attributes[key].description = object[key].description;
        }
        if (object[key].defaultsTo) {
          objModel.attributes[key].default = object[key].defaultsTo;
        }
        // if validation found
        if (object[key].validations) {
          if (object[key].validations.isEmail) {
            objModel.attributes[key].format = 'email';
          }

          if (object[key].validations.maxLength) {
            objModel.attributes[key].maxLength = object[key].validations.maxLength;
          }

          if (object[key].validations.minLength) {
            objModel.attributes[key].minLength = object[key].validations.minLength;
          }

          if (object[key].validations.isIn) {
            objModel.attributes[key].enum = object[key].validations.isIn;
          }
        }

        if (object[key].example) {
          objModel.attributes[key].example = object[key].example;
        }

        // if autoMigrations found
        if (object[key].autoMigrations) {
          if (object[key].autoMigrations.unique) {
            objModel.attributes[key].uniqueItems = true;
          }
        }
      }
    }
    return objModel;
  }

  function getInputs(path) {
    let inputs;
    try {
      let file = require(path);
      inputs = file.inputs;
    } catch (error) {
      inputs = "";
    }
    return inputs;
  }
};
