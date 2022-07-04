'use strict';

/* global variables: */
var map = null;
var map_title = null;
var map_colormap = null;
var active_polys = [];
var active_ids = [];
var zoom_level = -1;
var data_sets_url = 'https://dl.dropboxusercontent.com/s/z1g4yangpp8xw3f/data_sets.json.zip';
var data_sets = null;
var display_data = true;
var region = 'Australia';
var variable = 'prob_dhw_4';
var period = '1985-2019';
var scenario = 'observed';
var source_data_file = null;
var region_sel = document.getElementById('map_control_region');
var region_selected = null;
var variable_sel = document.getElementById('map_control_variable');
var variable_selected = null;
var period_sel = document.getElementById('map_control_period');
var period_selected = null;
var scenario_sel = document.getElementById('map_control_scenario');
var scenario_selected = null;
var display_button = document.getElementById('map_control_display');
var download_div = document.getElementById('map_data_download');

/* default colour map: */
var default_colormap = {
  'min': 0.0,
  'max': 1.0,
  'colors': [
    '#1400ff', '#0064ff', '#00dbff', '#00ffac', '#00ff36',
    '#46ff00', '#bdff00', '#ffca00', '#ff5300', '#ff0029'
  ]
};

/* variable specific colour maps: */
var colormaps = {
  'int_sst_var': {
    'min': 0,
    'max': 0.5,
    'colors': default_colormap['colors']
  },
  'seas_sst_var': {
    'min': 0.5,
    'max': 3.5,
    'colors': default_colormap['colors']
  },
  'trend_ann_sst': {
    'min': -0.1,
    'max': 0.1,
    'colors': default_colormap['colors']
  }
};

/* default map bounds: */
var default_bounds = {'bounds': [[-65, -180], [65, 180]]};

/* region specific bounds: */
var region_bounds = {
  'Australia': {'bounds': [[-45, 110], [-5, 170]]},
  'Brazil': {'bounds': [[-25, -50], [0, 30]]},
  'Caribbean': {'bounds': [[5, -100], [30, -55]]},
  'Coral_Triangle': {'bounds': [[-15, 90], [20, 165]]},
  'East_Asia': {'bounds': [[0, 90], [35, 135]]},
  'East_Pacific': {'bounds': [[-5, -110], [25, -75]]},
  'Fiji': {'bounds': [[-25, 130], [20, 180]]},
  'Hawaii': {'bounds': [[-5, -180], [30, -150]]},
  'Indian_Ocean': {'bounds': [[-30, 30], [25, 85]]},
  'Persian_Gulf': {'bounds': [[20, 45], [35, 65]]},
  'Polynesia': {'bounds': [[-30, -180], [5, -120]]},
  'Red_Sea': {'bounds': [[10, 30], [35, 55]]}
};

/** --- **/

/* fetch data sets index file: */
async function get_data_sets(url) {
  /* fetch the url: */
  var fetch_response = await fetch(url, {
    'cache': 'force-cache'
  });
  /* get the zip data as blob: */
  const data_blob = await fetch_response.blob();
  /* create the zip reader: */
  const zip_reader = new zip.ZipReader(new zip.BlobReader(data_blob));
  /* get the zip file entries (will only be one): */
  const zip_entries = await zip_reader.getEntries();
  /* get the data from the first zip entry as text: */
  var data_text = await zip_entries[0].getData(
    new zip.TextWriter(), {}
  ).catch(error => {});
  await zip_reader.close();
  /* if that worked, jsonify the data: */
  if (data_text != undefined) {
    data_sets = JSON.parse(data_text);
  };
  /* then load the map: */
  load_map();
  /* set up controls: */
  setup_map_controls();
  /* update download link: */
  update_download_link(region);
};

/* function to convert value to color: */
function value_to_color(data_var, value) {
  /* get the colour map: */
  var colormap = colormaps[data_var];
  /* if undefined, use default: */
  if (colormap == undefined) {
    colormap = default_colormap;
  };
  /* get the colours and bounds for variable: */
  var data_min = colormap['min'];
  var data_max = colormap['max'];
  var data_colors = colormap['colors'];
  /* number of colours: */
  var color_count = data_colors.length;
  /* max index value: */
  var max_index = color_count - 1;
  /* work out increment for color values: */
  var color_inc = (data_max - data_min) / color_count;
  /* work out colour index for value: */
  var color_index = Math.floor((value - data_min) / color_inc);
  if (color_index < 0) {
    color_index = 0;
  };
  if (color_index > max_index) {
    color_index = max_index;
  };
  /* return the colour: */
  return data_colors[color_index];
};

/* function to draw color map data: */
function draw_colormap(data_var) {
  /* get the colour map: */
  var colormap = colormaps[data_var];
  /* if undefined, use default: */
  if (colormap == undefined) {
    colormap = default_colormap;
  };
  /* get the colours and bounds for variable: */
  var data_min = colormap['min'];
  var data_max = colormap['max'];
  var data_colors = colormap['colors'];
  /* number of colours: */
  var color_count = data_colors.length;
  /* work out increment for color values: */
  var color_inc = (data_max - data_min) / color_count;
  /* create html: */
  var colormap_html = '';
  for (var i = (color_count - 1); i > -1; i--) {
    var my_html = '<p>';
    my_html += '<span class="map_colormap_color" style="background: ' + data_colors[i] + ';"></span>';
    my_html += '<span class="map_colormap_value">' + (data_min + (i * color_inc)).toFixed(2) + ' to ';
    my_html += (data_min + ((i + 1) * color_inc)).toFixed(2) + '</span>';
    my_html += '</p>';
    colormap_html += my_html;
  };
  /* return the html: */
  return colormap_html;
};

/* function to set map bounds: */
function set_map_bounds(data_region) {
  /* get the bounds for the region: */
  var data_bounds = region_bounds[data_region];
  /* if undefined, use default: */
  if (data_bounds == undefined) {
    data_bounds = default_bounds;
  };
  /* move to bounds: */
  map.flyToBounds(data_bounds['bounds']);
};

/* function to load map data: */
async function load_map_data(my_region, my_variable, my_period, my_scenario) {

  /* if arguments not specified, use default: */
  var my_region = (my_region == undefined) ? region : my_region;
  var my_variable = (my_variable == undefined) ? variable : my_variable;
  var my_period = (my_period == undefined) ? period : my_period;
  var my_scenario = (my_scenario == undefined) ? scenario : my_scenario;

  /* get the map bounds: */
  var map_bounds = map.getBounds();
  /* get the map zoom level: */
  var new_zoom = map.getZoom();

  /* data resolution for this zoom level: */
  if (new_zoom > 9) {
    new_zoom = 'd';
    var resolution = '0.01';
  } else if (new_zoom > 6) {
    new_zoom = 'c';
    var resolution = '0.1';
  } else if (new_zoom > 3) {
    new_zoom = 'b';
    var resolution = '0.5';
  } else {
    new_zoom = 'a';
    var resolution = '1';
  };

  /* if region has changed: */
  if (my_region != region) {
    /* reset map bounds: */
    set_map_bounds(my_region);
  };

  /* if data or zoom level has changed, or display_data is false ... : */
  if ((my_region != region) ||
      (my_variable != variable) ||
      (my_period != period) ||
      (my_scenario != scenario) ||
      (new_zoom != zoom_level) ||
      (display_data != true)) {
    /* remova all active polygons: */
    for (var i = 0; i < active_polys.length; i++) {
      var active_poly = active_polys[i];
      active_poly.remove();
    };
    active_polys = [];
    active_ids = [];
  } else {
    /* else, remove non visible polys: */
    var new_polys = [];
    var new_ids = [];
    /* loop through active polygons: */
    for (var i = 0; i < active_polys.length; i++) {
      /* get polygon coordinates: */
      var active_poly = active_polys[i];
      var active_poly_ll = active_poly.getLatLngs()[0];
      /* if polygon is in bounds, keep, else remove: */
      if ((map_bounds.contains(active_poly_ll[0])) ||
          (map_bounds.contains(active_poly_ll[1])) ||
          (map_bounds.contains(active_poly_ll[2])) ||
          (map_bounds.contains(active_poly_ll[3]))) {
        new_polys.push(active_poly);
        new_ids.push(active_poly.id);
      } else {
        active_poly.remove();
      };
    };
    /* update active polygons: */
    active_polys = new_polys;
    active_ids = new_ids;
  };

  /* init json_data variable: */
  var json_data;

  /* if display_data is true: */
  if (display_data == true) {
    /* data files for this data set and scenario: */
    var data_files = data_sets[my_region][my_variable][my_period][my_scenario][resolution]['files'];
    /* store the source data file name: */
    source_data_file = data_sets[my_region][my_variable][my_period][my_scenario]['file'];
    /* loop through the data files: */
    for (var f = 0; f < data_files.length; f++) {

      /* current data file: */
      var data_file = data_files[f];

      /* lat lon bounds for this file: */
      var file_bounds = L.latLngBounds(
        L.latLng([data_file['y_min'], data_file['x_min']]),
        L.latLng([data_file['y_max'], data_file['x_max']])
      );

      /* if data for this file is not in bounds, move on: */
      if (map_bounds.overlaps(file_bounds) != true) {
        continue;
      };

      /* retrieve the data if not yet fetched: */
      if (data_file['data'] == 'null') {
        let fetch_response = await fetch(data_file['path'], {
          'cache': 'force-cache'
        });
        /* get the zip data as blob: */
        const data_blob = await fetch_response.blob();
        /* create the zip reader: */
        const zip_reader = new zip.ZipReader(new zip.BlobReader(data_blob));
        /* get the zip file entries (will only be one): */
        const zip_entries = await zip_reader.getEntries();
        /* get the data from the first zip entry as text: */
        var data_text = await zip_entries[0].getData(
          new zip.TextWriter(), {}
        ).catch(error => {});
        await zip_reader.close();
        /* if that worked, jsonify the data: */
        if (data_text != undefined) {
          json_data = JSON.parse(data_text);
        };
        /* get number of data points and bin size from data: */
        var num_points = parseInt(json_data['points']);
        var bin_size = parseFloat(json_data['bin_size']);
        /* init arrays for storing labels: */
        var my_lat_labels = [];
        var my_lon_labels = [];

        /* if this data file contains aggregated / binned data: */
        if (data_file['aggregated'] == 'true') {
          /* loop through data points: */
          for (var i = 0; i < num_points ; i ++) {
              /* get data point lat and lon: */
              var my_lat = json_data['lats'][i];
              var my_lon = json_data['lons'][i];
              /* store labels: */
              my_lat_labels.push(
                my_lat.toFixed(2) + ' to ' + (my_lat + bin_size).toFixed(2)
              );
              my_lon_labels.push(
                my_lon.toFixed(2) + ' to ' + (my_lon + bin_size).toFixed(2)
              );
          };
        /* else, not aggregated: */
        } else {
          /* offset for data polygon drawing is half bin size: */
          var my_offset = bin_size / 2
          /* loop through data points: */
          for (var i = 0; i < num_points ; i ++) {
              /* get data point lat and lon: */
              var my_lat = json_data['lats'][i];
              var my_lon = json_data['lons'][i];
              /* store labels: */
              my_lat_labels.push(
                my_lat.toFixed(2)
              );
              my_lon_labels.push(
                my_lon.toFixed(2)
              );
              /* offset lat and lon values: */
              json_data['lats'][i] -= my_offset;
              json_data['lons'][i] -= my_offset;
          };
        };
        /* store the data labels in the json_data: */
        json_data['lat_labels'] = my_lat_labels;
        json_data['lon_labels'] = my_lon_labels;
        /* store the data in the json_data: */
        data_file['data'] = json_data;
      /* else data already retrieved: */
      } else {
        json_data = data_file['data'];
      };

      /* get number of points and bin size from data: */
      var num_points = parseInt(json_data['points']);
      var bin_size = parseFloat(json_data['bin_size']);
      /* loop through data points: */
      for (var i = 0; i < num_points; i++) {
        /* get data point lat and lon: */
        var my_lat = parseFloat(json_data['lats'][i]);
        var my_lon = parseFloat(json_data['lons'][i]);
        /* id for this polygon: */
        var my_poly_id = my_lat.toFixed(3) + '_' + my_lon.toFixed(3);
        /* if this polygon is already aactive, move on: */
        if (active_ids.indexOf(my_poly_id) > -1) {
          continue;
        };
        /* labels for this polygon: */
        var my_lat_label = json_data['lat_labels'][i];
        var my_lon_label = json_data['lon_labels'][i];
        /* values for this data point: */
        var my_count = parseInt(json_data['count'][i]);
        var my_mean = parseFloat(json_data['mean'][i]);
        var my_std = parseFloat(json_data['std'][i]);
        var my_min = parseFloat(json_data['min'][i]);
        var my_max = parseFloat(json_data['max'][i]);
        /* get the color for this polygon: */
        var my_color = value_to_color(my_variable, my_mean);

        /* create polygon for this data point: */
        var my_poly = L.rectangle(
          [[my_lat, my_lon],
           [my_lat + bin_size, my_lon + bin_size]], {
            'color': my_color,
            'weight': 0,
            'fillOpacity': 0.7
          }
        );

        /* get lats and lons for this polygon: */
        var my_poly_ll = my_poly.getLatLngs()[0];
        /* if this polygon is within bounds add to map: */
        if ((map_bounds.contains(my_poly_ll[0])) ||
            (map_bounds.contains(my_poly_ll[1])) ||
            (map_bounds.contains(my_poly_ll[2])) ||
            (map_bounds.contains(my_poly_ll[3]))) {
          /* if this is aggregated data :*/
          if (data_file['aggregated'] == 'true') {
            /* create tooltip: */
            my_poly.bindTooltip(
              '<b>Lat:</b> ' + my_lat_label + '<br>' +
              '<b>Lon:</b> ' + my_lon_label + '<br>' +
              '<b>Data points:</b> ' + my_count + '<br>' +
              '<b>Mean:</b> ' + my_mean.toFixed(2) + '<br>' +
              '<b>Std.:</b> ' + my_std.toFixed(2) + '<br>' +
              '<b>Min:</b> ' + my_min.toFixed(2) + '<br>' +
              '<b>Max:</b> ' + my_max.toFixed(2)
            );
          } else {
            /* not aggregated. create tooltip: */
            my_poly.bindTooltip(
              '<b>Lat:</b> ' + my_lat_label + '<br>' +
              '<b>Lon:</b> ' + my_lon_label + '<br>' +
              '<b>Value:</b> ' + my_mean.toFixed(2)
            );
          };
          /* set the id property for the polygon: */
          my_poly.id = my_poly_id;
          /* add polygon to map: */
          my_poly.addTo(map);
          /* store polygon details and id: */
          active_polys.push(my_poly);
          active_ids.push(my_poly.id);
        } else {
          /* not in active area, remove: */
          my_poly.remove();
        };
      /* end loop through data points: */
      };
    /* end loop through data files: */
    };
  /* end if display_data is true: */
  };
  /* store zoom level and data details: */
  zoom_level = new_zoom;
  region = my_region;
  variable = my_variable;
  period = my_period;
  scenario = my_scenario;
};

/* map loading function: */
function load_map() {

  /* cartodb map tiles: */
  var layer_cartodb = L.tileLayer(
    'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png', {
      attribution: '',
      minZoom: 0,
      maxZoom: 12
    }
  );

  /* data layer: */
  var layer_data = L.tileLayer('');
  /* add data layer listeners: */
  layer_data.addEventListener('add', function() {
    display_data = true;
    load_map_data();
  });
  layer_data.addEventListener('remove', function() {
    display_data = false;
    load_map_data();
  });

  /* reef area tiles: */
  var mapbox_tileset = 'thermalstressdata.aoa9t09h';
  var mapbox_token = 'pk.eyJ1IjoidGhlcm1hbHN0cmVzc2RhdGEiLCJhIjoiY2wwMjVzbWtvMDJyeTNrcDN6eG4wMmM2NiJ9.vVZvsUW_HO8Umz6j7H8arQ';
  var layer_reef_area = L.tileLayer(
    'https://api.mapbox.com/v4/' + mapbox_tileset + '/{z}/{x}/{y}.png32?access_token=' + mapbox_token, {
      tms: 0,
      opacity: 0.8,
      attribution: '',
      minZoom: 0,
      maxZoom: 12
    }
  );

  /* define map: */
  map = L.map('map', {
    zoom: 2,
    minZoom: 2,
    maxZoom: 12,
    layers: [],
    center: [0, 0],
    maxBounds: [
      [-75, -300],
      [75, 300]
    ],
    maxBoundsViscosity: 1.0,
    zoomControl: false,
    attributionControl: false
  });

  /* add layers to map: */
  map.addLayer(layer_cartodb);

  /* add control button: */
  var map_control_open = L.control({position: 'topleft'});
  map_control_open.onAdd = function(map) {
     this._div = L.DomUtil.create('div', 'map_controls_open_container');
     this.update();
     return this._div;
  };
  map_control_open.update = function(props) {
    this._div.innerHTML = '<img class="map_controls_open" ' +
                          'src="img/map/menu.png">';
  };
  map_control_open.addTo(map);

  /* add listener for map controls open button ... get the element: */
  var map_controls_open_el = document.getElementsByClassName('map_controls_open_container')[0];
  /* add the listener: */
  map_controls_open_el.addEventListener('click', map_controls_toggle);

  /* add zoom control: */
  var zoom_control = L.control.zoom();
  zoom_control.addTo(map);

  /* add map title: */
  map_title = L.control();
  map_title.onAdd = function(map) {
     this._div = L.DomUtil.create('div', 'map_ctl map_title');
     this.update();
     return this._div;
  };
  map_title.update = function(title) {
    if (title != undefined) {
      this._div.innerHTML = title;
    };
  };
  map_title.addTo(map);
  /* update map title: */
  var my_title = region + ', ' + variable + ', ' +
                 period + ', ' + scenario;
  map_title.update(my_title);

  /* add colormap: */
  var colormap_src = draw_colormap(variable);
  map_colormap = L.control({position: 'bottomright'});
  map_colormap.onAdd = function(map) {
    this._div = L.DomUtil.create('div', 'map_ctl map_colormap');
      this.update(colormap_src);
      return this._div;
  };
  map_colormap.update = function(colormap_html) {
    this._div.innerHTML = colormap_html;
  };
  map_colormap.addTo(map);

  /* selectable layers: */
  var selectable_layers = {
    'data': layer_data,
    'reef area': layer_reef_area
  };
  /* add layer control: */
  L.control.layers(
    null,
    selectable_layers,
    {collapsed: false}
  ).addTo(map);

  /* add scale bar: */
  L.control.scale().addTo(map);

  /* set the map bounds: */
  set_map_bounds(region);

  /* load the data: */
  map.addLayer(layer_data);

  /* reload data on map zoom: */
  map.on('zoomend', function() {
    load_map_data();
  });

  /* reload data on map move: */
  map.on('moveend', function() {
    load_map_data();
  });

/* end load_map function: */
};

/* function to toggle map controls: */
function map_controls_toggle() {
  /* map control element: */
  var map_controls_el = document.getElementById('map_controls');
  /* get width: */
  var map_controls_width = map_controls_el.style.width;
  /* if controls are not visible: */
  if (map_controls_width == '0px') {
    /* show the controls: */
    map_controls_el.style.width = '16em';
    map_controls_el.style.paddingLeft = '0.5em';
  } else {
    /* hide the controls: */
    map_controls_el.style.width = '0px';
    map_controls_el.style.paddingLeft = '0px';
  };
}

/* function to handle region changes: */
function control_region() {
  /* disable run button: */
  display_button.setAttribute('disabled', true);
  /* get selected region: */
  var selected_region = region_sel.options[region_sel.selectedIndex].value;
  /* reset variable options: */
  var region_object = data_sets[selected_region];
  var all_variables = Object.keys(region_object);
  all_variables.sort();
  /* try to get index of currently selected variable: */
  var variable_index = all_variables.indexOf(variable_selected);
  if (variable_index == -1) {
    variable_index = 0;
  };
  /* add select elements: */
  var my_html = '';
  for (var i = 0; i < all_variables.length; i++) {
    var my_variable = all_variables[i];
    my_html += '<option value="' + my_variable + '"';
    /* if selected index: */
    if (i == variable_index) {
      my_html += ' selected';
    };
    my_html += '>' + my_variable + '</option>';
  };
  variable_sel.innerHTML = my_html;
  /* store selected region: */
  region_selected = selected_region;
  /* update variable: */
  control_variable();
};

/* function to handle variable changes: */
function control_variable() {
  /* disable run button: */
  display_button.setAttribute('disabled', true);
  /* get selected variable: */
  var selected_variable = variable_sel.options[variable_sel.selectedIndex].value;
  /* reset period options: */
  var period_object = data_sets[region_selected][selected_variable];
  var all_periods = Object.keys(period_object);
  all_periods.sort();
  /* try to get index of currently selected period: */
  var period_index = all_periods.indexOf(period_selected);
  if (period_index == -1) {
    period_index = 0;
  };
  /* add select elements: */
  var my_html = '';
  for (var i = 0; i < all_periods.length; i++) {
    var my_period = all_periods[i];
    my_html += '<option value="' + my_period + '"';
    /* if selected period: */
    if (i == period_index) {
      my_html += ' selected';
    };
    my_html += '>' + my_period + '</option>';
  };
  period_sel.innerHTML = my_html;
  /* store selected variable: */
  variable_selected = selected_variable;
  /* update periods: */
  control_period();
};

/* function to handle period changes: */
function control_period() {
  /* disable run button: */
  display_button.setAttribute('disabled', true);
  /* get selected period: */
  var selected_period = period_sel.options[period_sel.selectedIndex].value;
  /* reset scenario options: */
  var scenario_object = data_sets[region_selected][variable_selected][selected_period];
  var all_scenarios = Object.keys(scenario_object);
  all_scenarios.sort();
  /* try to get index of currently selected scenario: */
  var scenario_index = all_scenarios.indexOf(scenario_selected);
  if (scenario_index == -1) {
    scenario_index = 0;
  };
  /* add select elements: */
  var my_html = '';
  for (var i = 0; i < all_scenarios.length; i++) {
    var my_scenario = all_scenarios[i];
    my_html += '<option value="' + my_scenario + '"';
    /* if selected scenario: */
    if (i == scenario_index) {
      my_html += ' selected';
    };
    my_html += '>' + my_scenario + '</option>';
  };
  scenario_sel.innerHTML = my_html;
  /* store selected period: */
  period_selected = selected_period;
  /* update senarios: */
  control_scenario();
};

/* function to handle scenario changes: */
function control_scenario() {
  /* get selected scenario: */
  var selected_scenario = scenario_sel.options[scenario_sel.selectedIndex].value;
  /* store selected scenario: */
  scenario_selected = selected_scenario;
  /* enable run button: */
  display_button.removeAttribute('disabled');
};

/* function to update download link: */
function update_download_link(region_selected) {
    /* get download url and size: */
    var download_file = downloads[region_selected]['file'];
    var download_url = downloads[region_selected]['url'];
    var download_size = downloads[region_selected]['size'];
    /* create the html: */
    var download_html = 'Download:<br>';
    download_html += '<a href="' + download_url + '">';
    download_html += download_file + ' [' + download_size + ']</a>';
    /* update the html: */
    download_div.innerHTML = download_html;
};

/* function to display data via display button: */
function display_map_data() {
  /* update the map: */
  load_map_data(region_selected, variable_selected, period_selected,
                scenario_selected);
  /* update map title: */
  var my_title = region_selected + ', ' + variable_selected + ', ' +
                 period_selected + ', ' + scenario_selected;
  map_title.update(my_title);
  /* update colour map: */
  map_colormap.update(draw_colormap(variable_selected));
  /* update download link: */
  update_download_link(region_selected);
};

/* function to set up map controls: */
function setup_map_controls() {
  /* region ... get available regions: */
  var all_regions = Object.keys(data_sets);
  all_regions.sort();
  /* add select elements: */
  var my_html = '';
  for (var i = 0; i < all_regions.length; i++) {
    var my_region = all_regions[i];
    my_html += '<option value="' + my_region + '"';
    if (my_region == region) {
      my_html += ' selected';
    };
    my_html += '>' + my_region.replace('_', ' ') + '</option>';
  };
  region_sel.innerHTML = my_html;
  region_selected = region;
  /* add change listener: */
  region_sel.addEventListener('change', control_region);
  /* variable ... get available variables: */
  var region_object = data_sets[region];
  var all_variables = Object.keys(region_object);
  all_variables.sort();
  /* add select elements: */
  var my_html = '';
  for (var i = 0; i < all_variables.length; i++) {
    var my_variable = all_variables[i];
    my_html += '<option value="' + my_variable + '"';
    if (my_variable == variable) {
      my_html += ' selected';
    };
    my_html += '>' + my_variable + '</option>';
  };
  variable_sel.innerHTML = my_html;
  variable_selected = variable;
  /* add change listener: */
  variable_sel.addEventListener('change', control_variable);
  /* period ... get available periods: */
  var variable_object = region_object[variable];
  var all_periods = Object.keys(variable_object);
  all_periods.sort();
  /* add select elements: */
  var my_html = '';
  for (var i = 0; i < all_periods.length; i++) {
    var my_period = all_periods[i];
    my_html += '<option value="' + my_period + '"';
    if (my_period == period) {
      my_html += ' selected';
    };
    my_html += '>' + my_period + '</option>';
  };
  period_sel.innerHTML = my_html;
  period_selected = period;
  /* add change listener: */
  period_sel.addEventListener('change', control_period);
  /* scenario ... get available scenarios: */
  var period_object = variable_object[period];
  var all_scenarios = Object.keys(period_object);
  all_scenarios.sort();
  /* add select elements: */
  var my_html = '';
  for (var i = 0; i < all_scenarios.length; i++) {
    var my_scenario = all_scenarios[i];
    my_html += '<option value="' + my_scenario + '"';
    if (my_scenario == scenario) {
      my_html += ' selected';
    };
    my_html += '>' + my_scenario + '</option>';
  };
  scenario_sel.innerHTML = my_html;
  scenario_selected = scenario;
  /* add change listener: */
  scenario_sel.addEventListener('change', control_scenario);
  /* enable run button: */
  display_button.removeAttribute('disabled');
  /* add display button listener: */
  display_button.addEventListener('click', display_map_data);
};

/** add listeners: **/

/* on page load: */
window.addEventListener('load', function() {
  /* configure zip.js: */
  zip.configure({
    useWebWorkers: true,
    maxWorkers: 2,
    workerScripts: {
      inflate: ['js/z-worker-fflate.js', './fflate.min.js'],
    }
  });
  /* get data set information ... : */
  get_data_sets(data_sets_url);
});
