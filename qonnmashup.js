/*global require, alert, prompt*/
/*
 * Dynamic mashup
 * @owner Erik Wetterberg (ewg)
 */
/*
 *    Fill in host and port for Qlik engine
 */
var prefix = window.location.pathname.substr( 0, window.location.pathname.toLowerCase().lastIndexOf( "/extensions" ) + 1 );

var config = {
	host: window.location.hostname,
	prefix: prefix,
	port: window.location.port,
	isSecure: window.location.protocol === "https:"
};

require.config( {
	baseUrl: (config.isSecure ? "https://" : "http://" ) + config.host + (config.port ? ":" + config.port : "" ) + config.prefix + "resources"
} );

require( ["js/qlik"], function ( qlik ) {
	function getURLParameter ( name ) {
		return ( RegExp( name + '=' + '(.+?)(&|$)' ).exec( location.search ) || [null, null] )[1];
	}

	qlik.setOnError( function ( error ) {
		alert( error.message );
	} );

	//
	var appid = getURLParameter( "app" ), app, dialogId = 0, tabContainer, isPersonalMode;
	$( document ).ready( function () {
		var global = qlik.getGlobal( config );
		global.isPersonalMode( function ( reply ) {
			isPersonalMode = reply.qReturn;
			$( '#personal' ).html( 'Personal mode:' + reply.qReturn );
		} );
		if ( appid && appid !== null ) {
			app = qlik.openApp( decodeURIComponent( appid ), config );
			new AppUi( app );
		} else {
			global.getAppList( function ( reply ) {
				var $qvname = $( "#qvname" );
				$qvname.children().remove();
				reply.forEach( function ( value ) {
					$qvname.append( "<option value='" + value.qDocId + "'>" + value.qDocName + "</option>" );
				} );
			} );
			// modal primary button: hide modal, open app
			$( '#openModal .btn-primary' ).click( function () {
				$( '#openModal' ).modal( 'hide' );
				appid = $( "#qvname" ).val();
				app = qlik.openApp( appid, config );
				new AppUi( app );
			} );
			$( '#openModal' ).modal();
		}
	} );

	function AppUi ( app ) {
		this.app = app;
		app.getAppLayout( function ( layout ) {
			$( "#lastreload" ).html( "Last reload:" + layout.qLastReloadTime.replace( /T/, ' ' ).replace( /Z/, ' ' ) );
			$( "#title" ).html( layout.qTitle );
		} );
		initBookmarkMenu( app );
		initButtons( app );
		initObjectList( app );
		new FieldList( app );
	}

	function initObjectList ( app ) {
		//create a menu with all visualizations that have titles
		//not a good solution if you have many visualizations
		var vislist = $( '#qvislist' );
		vislist.delegate( 'a[data-id]', "click", function ( e ) {
			var title = $( this ).data( 'title' ), id = $( this ).data( 'id' );
			if ( id ) {
				addChart( app, id, title );
			}
		} );

		app.getList( 'sheet', function ( reply ) {
			vislist.html( "" );
			reply.qAppObjectList.qItems.forEach( function ( value ) {
				vislist.append( '<li id="sheet_' + value.qInfo.qId + '">' + value.qData.title + '</li>' );

				app.getFullPropertyTree( value.qInfo.qId ).then( function ( prop ) {
					var str = "";
					prop.propertyTree.qChildren.forEach( function ( child ) {
						if ( child.qProperty.title ) {
							str += '<li><a href="#" data-id="' + child.qProperty.qInfo.qId + '" data-title="' + child.qProperty.title + '">' + child.qProperty.title + '</a></li>';
						}
					} );
					$( '#sheet_' + value.qInfo.qId ).replaceWith( str );
				} );

			} );
		} );
	}

	function initBookmarkMenu ( app ) {
		app.getList( "BookmarkList", function ( reply ) {
			var str = "";
			reply.qBookmarkList.qItems.forEach( function ( value ) {
				if ( value.qData.title ) {
					str += '<li><a href="#" data-id="' + value.qInfo.qId + '">' + value.qData.title + '</a></li>';
				}
			} );
			str += '<li><a href="#" data-cmd="create">Create</a></li>';
			$( '#qbmlist' ).html( str ).find( 'a' ).on( 'click', function () {
				var id = $( this ).data( 'id' );
				if ( id ) {
					app.bookmark.apply( id );
				} else {
					var cmd = $( this ).data( 'cmd' );
					if ( cmd === "create" ) {
						var title = prompt( 'Bookmark title' ), desc = prompt( 'Bookmark desc' );
						app.bookmark.create( title, desc );
					}
				}
			} );
		} );
	}

	/**
	 * List of fields displayed on the left hand side
	 */
	function FieldList ( app ) {
		var me = this;
		app.getList( "FieldList", function ( reply ) {
			me.fields = reply.qFieldList.qItems;
			me.render();
		} );
		app.getList( 'CurrentSelections', function ( reply ) {
			var yearSel = reply.qSelectionObject.qSelections.filter( function ( val ) {return val.qField === 'Year'} );
			var selectedYears = yearSel[0] ? yearSel[0].qSelectedCount : 0;

			me.selections = reply.qSelectionObject.qSelections;
			me.render();
			$( "[data-qcmd='back']" ).toggleClass( 'disabled', reply.qSelectionObject.qBackCount < 1 );
			$( "[data-qcmd='forward']" ).toggleClass( 'disabled', reply.qSelectionObject.qForwardCount < 1 );
		} );
	}

	/**
	 * Render the list of fields. Called whenever the fieldlist or selectionlist is updated.
	 */
	FieldList.prototype.render = function () {
		var $fields = $( "#fields" ), str = "<ul class='list-group'>", added = {}, me = this;
		if ( me.selections ) {
			me.selections.forEach( function ( fld ) {
				str += '<li class="list-group-item" data-value="' + fld.qField + '">' + fld.qField + '<span class="badge">' + fld.qSelectedCount + '/' + fld.qTotal + '</span></li>';
				added[fld.qField] = true;
			} );
		}
		if ( this.fields ) {
			this.fields.forEach( function ( fld ) {
				if ( !added[fld.qName] ) {
					str += '<li class="list-group-item" data-value="' + fld.qName + '">' + fld.qName + '</li>';
				}
			} );
		}
		str += "</ul>";
		$fields.html( str ).find( '.list-group-item' ).on( 'click', function () {
			me.addFieldDialog( $( this ).data( 'value' ) );
		} );
	}
	var FieldMenu = '<a href="#" class="dropdown-toggle" data-toggle="dropdown">Menu<b class="caret"></b></a>' + '<ul class="dropdown-menu">';
	["clear", "lock", "unlock", "clearOther", "selectExcluded", "selectAll", "selectAlternative", "selectPossible"].forEach( function ( val ) {
		FieldMenu += '<li><a href="#" class="qcmd" data-qcmd="' + val + '">' + val.charAt( 0 ).toUpperCase() + val.slice( 1 ) + '</a></li>';
	} );
	FieldMenu += '</ul>';
	FieldList.prototype.addFieldDialog = function ( fld ) {

		var id = "fld" + dialogId;
		var str = "<li class='panel panel-primary'><div class='panel-heading'><h3 class='panel-title'>" + //
			"<a data-toggle='collapse' data-target='#collapse" + id + "' href='#collapse" + id + "'>" + fld + "</a></h3>" + //
			"<span id='fldmenu' class='panel-menu'>" + FieldMenu + "</span></div>" + //
			"<div id='collapse" + id + "' class='panel-collapse collapse in'>" + //
			"<div class='panel-body' style='width: 100%; height: 150px;'><ul class='list-group' id='" + id + "'></ul></div></div>";
		$( "#panel-list" ).append( str );
		//TODO:perhaps an id at a higher level??
		$( '#' + id ).parent().parent().parent().find( "a" ).on( "click", function () {
			var qcmd = $( this ).data( "qcmd" );
			if ( qcmd ) {
				app.field( fld )[qcmd]();
			}
		} );
		dialogId++;

		app.createList( {
			qDef: {
				qFieldDefs: [fld]
			},
			qInitialDataFetch: [{
				qHeight: 20,
				qWidth: 1
			}]
		}, function ( reply ) {
			var str = "";
			reply.qListObject.qDataPages[0].qMatrix.forEach( function ( value ) {
				if ( value[0].qText ) {
					str += '<li class="list-group-item state' + value[0].qState + '" data-value="' + value[0].qElemNumber + '">' + value[0].qText + '</li>';
				}
			} );
			$( '#' + id ).html( str ).find( "li" ).on( "click", function () {
				var value = $( this ).data( 'value' );
				if ( value ) {
					app.field( fld ).select( [value], true, true );
				}
			} );
		} );

	}
	function modifyVis ( vis ) {
		if ( $( '#propPanel' ).is( ":visible" ) ) {
			$( '#propPanel' ).hide();
			return;
		}
		if ( vis.layout.qHyperCube ) {
			var html = "<table><tr><th>Column</th><th>Order</th></tr>";
			var sortOrder = vis.layout.qHyperCube.qEffectiveInterColumnSortOrder, columns = [],
				dimcount = vis.layout.qHyperCube.qDimensionInfo.length;
			vis.layout.qHyperCube.qDimensionInfo.forEach( function ( dim, index ) {
				columns.push( {col: index, title: dim.qFallbackTitle, order: dim.qSortIndicator} );
			} );
			vis.layout.qHyperCube.qMeasureInfo.forEach( function ( mea, index ) {
				columns.push( {col: index + dimcount, title: mea.qFallbackTitle, order: mea.qSortIndicator} );
			} );
			columns.forEach( function ( col, index ) {
				html += "<tr><td data-col=" + col.col + ">" + col.title + "</td><td><span class='icon  icon-triangle-"
				+ (col.order === 'D' ? "bottom" : "top"  ) + "' role='presentation'></span></td></tr>";
			} );
			html += "</table>";

			$( '#propPanel' ).show().find( '.panel-body' ).html( html ).find( 'td' ).on( 'click', function () {
				var col = $( this ).data( "col" );
				if ( col !== undefined ) {
					sortOrder = reOrder( vis, sortOrder, col );
				}
			} );
		}
	}

	function reOrder ( vis, sortOrder, col ) {
		// set the new column first
		var newOrder = [col];
		//append all other columns in the same order
		sortOrder.forEach( function ( val ) {
			if ( val !== newOrder[0] ) {
				newOrder.push( val );
			}
		} );
		var patches = [{
			'qPath': '/qHyperCubeDef/qInterColumnSortOrder',
			'qOp': 'replace',
			'qValue': '[' + newOrder.join( ',' ) + ']'
		}];
		vis.applyPatches( patches, true );

		return newOrder;
	}

	function initButtons ( app ) {
		$( "[data-qcmd]" ).on( 'click', function () {
			var $element = $( this );
			switch ( $element.data( 'qcmd' ) ) {
				//app level commands
				case 'clearAll':
					app.clearAll();
					break;
				case 'back':
					app.back();
					break;
				case 'forward':
					app.forward();
					break;
				case 'lockAll':
					app.lockAll();
					break;
				case 'unlockAll':
					app.unlockAll();
					break;
				case 'close':
					app.close();
					break;
				case 'reload':
					if ( isPersonalMode ) {
						app.doReload().then( function () {
							app.doSave();
						} );
					} else {
						qlik.callRepository( '/qrs/app/' + appid + '/reload', 'POST' ).success( function ( reply ) {
							alert( "App reloaded" );
						} );
					}
					break;
				case 'searchSuggest':
					app.searchSuggest( [$( "#searchText" ).val()], {}, function ( reply ) {
						var html = '<table class="table table-striped"><tbody>';
						html += '<tr><td>Suggestions</td><td>';
						reply.qResult.qSuggestions.forEach( function ( val ) {
							html += val.qValue + ' ';
						} );
						html += '</td></tr>';
						html += '<tr><td>Field names</td><td>';
						reply.qResult.qFieldNames.forEach( function ( val ) {
							html += val;
						} );
						html += '</td></tr>';
						html += '</tbody></table>';
						$( "#searchResult" ).html( html );
					} );
					break;
				case 'searchAssociations':
					app.searchAssociations( [$( "#searchText" ).val()], {
						qOffset: 0,
						qCount: 15,
						qMaxNbrFieldMatches: 5
					}, {}, function ( reply ) {
						//TODO:handle no match
						var html = '<table class="table table-striped"><thead><tr><th>Field</th><th>Result</th></tr></thead><tbody>';
						if ( reply.qResults.qTotalSearchResults === 0 ) {
							html = 'No matches';
						} else {
							reply.qResults.qFieldDictionaries.forEach( function ( value ) {
								html += '<tr><td>' + reply.qResults.qFieldNames[value.qField] + '</td><td>';
								value.qResult.forEach( function ( res ) {
									html += res.qText + ' ';
								} );
								html += '</td></tr>';
							} );
							html += '</tbody></table>';
						}
						$( "#searchResult" ).html( html );
					} );
					break;
			}
		} );
	}

	/**
	 * Create a tab container
	 * map activate to qlik resize
	 */
	function TabContainer () {
		//create the tab container
		var me = this;
		this.$tabs = $( "#vistabs" );
		this.$content = $( "#viscontent" );
		this.tabCounter = 0;
		//visualizations showed in this tab
		this.visualizations = {};
		//enable tab click
		this.$tabs.delegate( 'a[data-toggle="tab"]', "click", function ( e ) {
			e.preventDefault();
			$( '#propPanel' ).hide();
			$( this ).tab( 'show' );
		} );
		//call qlik resize when tab is shown
		this.$tabs.delegate( 'a[data-toggle="tab"]', 'shown.bs.tab', function () {
			qlik.resize();
		} );
		//enable the close button
		this.$tabs.delegate( '.icon-close', "click", function () {
			var li = $( this ).closest( "li" ), tabid = li.find( 'a' ).attr( "href" );
			$( tabid ).remove();
			li.remove();
			tabid = tabid.replace( /#/, '' );
			if ( me.visualizations[tabid] ) {
				me.visualizations[tabid].close();
			}
			//show first tab
			me.$tabs.find( 'a:first' ).tab( 'show' );
		} );
		//enable the edit button
		this.$tabs.delegate( '.icon-edit', "click", function () {
			var tabid = $( this ).closest( "li" ).find( 'a' ).attr( "href" );
			tabid = tabid.replace( /#/, '' );
			if ( me.visualizations[tabid] ) {
				modifyVis( me.visualizations[tabid] );
			}
		} );

	}

	/**
	 * Add a tab to the container and return the id
	 * @param {String} label
	 */
	var REMOVE_BTN = "<span class='icon icon-close' title='Remove Tab'></span>";
	var PROP_BTN = "<span class='icon icon-edit' title='Properties'></span>";
	TabContainer.prototype.addTab = function ( label, btn ) {
		var tabid = "tabs-" + this.tabCounter;
		var li = "<li><a data-toggle='tab' href='#" + tabid + "'>" + label + "</a><span class='tab-icons'>" + REMOVE_BTN + ( btn ? btn : "") + "</span></li>";
		this.$tabs.append( li );
		this.$content.append( "<div class='tab-pane' id='" + tabid + "'></div>" );
		this.$tabs.find( 'a:last' ).tab( 'show' );
		this.tabCounter++;
		return tabid;
	}
	/**
	 * Set title on tab
	 * @param {Object} model visualization or snapshot containg a title
	 * @param {String} tabid id for the tab
	 */
	TabContainer.prototype.setTitle = function ( model, tabid ) {
		if ( model.layout.title ) {
			$( 'a[href="#' + tabid + '"]' ).html( model.layout.title );
		}
	}
	/**
	 * dynamically add a visualization to the tabs
	 * @param {App} app the app
	 * @param {String} id visualization id
	 * @param {String} title
	 * @param {Object} options
	 */
	//
	function addChart ( app, id, title, options ) {
		if ( !tabContainer ) {
			tabContainer = new TabContainer();
		}
		var tabid = tabContainer.addTab( title, PROP_BTN );
		app.getObject( tabid, id, options ).then( function ( model ) {
			tabContainer.visualizations[tabid] = model;
			tabContainer.setTitle( model, tabid );
			model.Validated.bind( function () {
				tabContainer.setTitle( this, tabid );
			} );
		} );

	}

} );

