/**
 * JQuery multiple file uploader, supports single and multiple files(HTML5)
 * Drag and drop(HTML5), falls back to iFrame for single file uploads
 *
 * @author Shitiz Garg
 * @copyright 2010 Shitiz Garg
 * @version 0.2
 * @license 
	The MIT License {@link http://www.opensource.org/licenses/mit-license.php MIT License}

	Copyright (c) 2010-2011 Shitiz Garg

	Permission is hereby granted, free of charge, to any person obtaining a copy
	of this software and associated documentation files (the "Software"), to deal
	in the Software without restriction, including without limitation the rights
	to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
	copies of the Software, and to permit persons to whom the Software is
	furnished to do so, subject to the following conditions:

	The above copyright notice and this permission notice shall be included in
	all copies or substantial portions of the Software.

	THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
	IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
	FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
	AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
	LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
	OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
	THE SOFTWARE.
 */
/**
 * Change log :
 * 0.1 (19 December 2010)
 * - initial version
 *
 * 0.2 (2 January 2011)
 * - Removed jQuery UI widget dependency
 * - Removed jQuery Form dependency, instead switched to a custom made class
 * - Removed jQuery progressbar dependency, but still uses it if available
 * - Use PECL::uploadprogress's provided speed instead of calculating our own(Provided we're using it)
 */
(function($) {
	/**
	 * Wrapper for uploader, prevents the headache of adding new as a prefix
	 */
	$.uploader = function(options)
	{
		return new $._uploader(options);
	};

	/**
	 * Uploader initialiser
	 */
	$._uploader = function(options)
	{
		var self = this;

		self.options = $.extend(this.defaultOpts, options);

		self.inputs = [];
		self.queued = [];
		self.current_index = null;
		self.upload_started = 0;

		// Set some options straight
		self.element = $(self.options.input_area);
		self.new_file = $(self.options.new_file);
		self.queued_area = $(self.options.queued_area);
		self.uploaded_area = $(self.options.uploaded_area);
		self.upload = $(self.options.upload);
		self.progress_area = $(self.options.progress_area);
		self.uploading = false;

		if (self.options.allow_drop)
			self.drop_area = $(self.options.drop_area);

		// In case we're doing this again
		self.element.show();
		self.element.html('');

		// Are we missing anything?
		if (!self.drop_area || !self.canXHRUpload())
			self.options.allow_drop = false;

		// We only support multiple file uploads and drag and drop for the browsers which can do xhr uploads
		if (self.options.allow_multiple && !self.canXHRUpload())
			self.options.allow_multiple = false;

		// SHould we show the progress?
		if (!self.canXHRUpload())
			self.options.show_progress = self.options.show_manual_progress;
		else
			self.upload.hide();

		// Add the events
		self.new_file.click(function()
		{
			self.add_file();
		});
		if (self.options.allow_multiple)
		{
			self.add_file();
			self.new_file.remove();
		}

		self.upload.click(function()
		{
			self.startUpload();
		});

		if (self.options.allow_drop)
		{
			document.getElementById(self.drop_area.attr('id')).ondragover = function(e)
			{
				var effect = e.dataTransfer.effectAllowed;
				if (effect == 'move' || effect == 'linkMove')
					e.dataTransfer.dropEffect = 'move';
				else
					e.dataTransfer.dropEffect = 'copy';
				e.stopPropagation();
				e.preventDefault();
			};
			document.getElementById(self.drop_area.attr('id')).ondrop = function(e)
			{
				self.dropFile(e);
			};
		}
	};

$.extend($._uploader.prototype, {
	defaultOpts: {
		input_area: '#input_area',
		new_file: '#new_file',
		upload: '#upload_button',
		queued_area: '#queued',
		url: null,
		progress_area: '#progress_area',
		uploaded_area: '#uploaded_area',
		show_progress: true,
		show_manual_progress: true,
		allow_multiple: true,
		allow_drop: true,
		progress_url: null,
		drop_area: null,
		input_name: 'upload_file',
		delete_img: 'cross.png',
		accept: '',
		url_suffix: '?filename=%filename%',
		instantUpload: true,

		// Events
		abort: null,
		attach: null,
		progress: null,
		start: null,
		finish: null
	},

	// Triggers an event
	_trigger: function(event_name, event, params)
	{
		var self = this;

		if (typeof params == 'undefined')
			params = {};

		if ($.isFunction(self.options[event_name]))
			self.options[event_name].apply(self, [event, params]);
	},

	dropFile: function(event)
	{
		var self = this;

		// Make sure we are dragging a file over
		if (!event.dataTransfer && !(dt.files || (!$.browser.webkit && event.dataTransfer.types.contains && event.dataTransfer.types.contains('Files'))))
			return false;

		// Add this to the file list
		self.updateQueuedFiles(event.dataTransfer.files);
	},

	/**
	 * Checks if we can do XHR uploads or not
	 */
	canXHRUpload: function()
	{
		if (typeof(File) == 'undefined' || typeof((new XMLHttpRequest).upload) == 'undefined')
			return false;
		return true;
	},

	/**
	 * Adds a file box to the element list
	 */
	add_file: function()
	{
		var self = this;
		var i = self.inputs.length;

		// Create the element
		var container = $('<div></div>');
		container.appendTo(self.element);

		self.inputs[i] = $('<input type="file" />');
		self.inputs[i]
			.appendTo(container)
			.attr('id', 'uinput_' + i)
			.attr('name', self.options.input_name)
			.attr('accept', self.options.accept)
			/**
			 * We need to make sure that the file's list stays updated
			 * So whenever the value of this input changes, we change the form's element
			 */
			.change(function(event)
			{
				if (self.canXHRUpload())
					self.updateQueuedFiles(this.files, event);
				else
					self.updateQueuedInputs($(this), event);

				// Instantly uploading?
				if (self.options.instantUpload)
					self.startUpload(event);
			});

		if (self.options.allow_multiple)
			self.inputs[i].attr('multiple', 'multiple');
	},

	/**
	 * Adds an input element to the list of uploads
	 */
	updateQueuedInputs: function(input, event)
	{
		var self = this;
		self.removeFile(input.attr('id').substr(7));

		var id = input.attr('id').substr(7);

		if (input.val().length == 0)
			return false;

		if ($('#qi_' + id))
		{
			$('#qi_' + id).remove();
 			delete self.queued[id];
		}

		// Add this to the actual queued internal list
		self.queued[id] = input;

		// Add it to the queued elements list
		$('<div class="file_queued"></div>')
			.html(self.getFileName(id))
			.attr('id', 'q_' + id)
			.hide()
			.appendTo(self.queued_area);

		// Create the delete button
		$('<img alt="" border="0" style="cursor: pointer; cursor: hand; margin-right: 15px;" />')
			.attr('src', self.options.delete_img)
			.prependTo($('#q_' + id))
			.click(function(event)
			{
				self.removeFile($(this).parent().attr('id').substr(2), event);
			});

		// Trigger the attach event
		self._trigger('attach', event, {id: id, filename: self.getFileName(id), type: 'input', element: input});

		$('#q_' + id).fadeIn(200);
	},

	/**
	 * Adds a "File" instance to the uploaders list
	 */
	updateQueuedFiles: function(files, event)
	{
		var self = this;

		// Add the files to the list
		return attachFilesChain(0);
		function attachFilesChain(i)
		{
			if (typeof files[i] == 'undefined')
				return true;

			var id = self.queued.length;
			self.queued[self.queued.length] = files[i];
			$('<div class="file_queued"></div>')
				.html(files[i].fileName)
				.attr('id', 'q_' + id)
				.hide()
				.appendTo(self.queued_area);

			// Create the delete button
			$('<img alt="" border="0" style="cursor: pointer; cursor: hand; margin-right: 15px;" />')
				.attr('src', self.options.delete_img)
				.prependTo($('#q_' + id))
				.click(function(event)
				{
					self.removeFile($(this).parent().attr('id').substr(2), event);
				});

			// Trigger the attach event
			self._trigger('attach', event, {id: id, filename: self.getFileName(id), type: 'file', element: files[i]});

			$('#q_' + id).fadeIn(600);
			setTimeout(function()
			{
				attachFilesChain(i + 1);
			}, 400);
		}
	},

	/**
	 * Removes a file from the queue, even stops it if it is on progress
	 */
	removeFile: function(i, event)
	{
		var self = this;
		if (typeof(self.queued[i]) == 'undefined')
			return false;
		var fname = self.getFileName(i);
		delete self.queued[i];
		$('#q_' + i).fadeOut('slow', function()
		{
			$(this).remove();
		});

		// Update every darn index so that we don't mess up
		var copy = self.queued;
		self.queued = [];
		var x = 0;
		for (k in copy)
		{
			$('#q_' + k).attr('id', 'q_' + x);
			self.queued[x] = copy[k];
			x++;
		}

		// Teh index....
		old_index = self.current_index;
		self.current_index = -1;

		// Currently uploading this file? Abort the action and move to the next one
		if (old_index == i)
		{
			self.current_xhr.abort();

			self.progress_area.html('');
			var element = $('<div class="error">' + fname + ' (aborted)</div>');
			element.appendTo(self.uploaded_area);

			self._trigger('abort', event, {id: i});

			self.uploadFile(0, event);
		}
	},

	/**
	 * Uploads all the file in their respective methods
	 */
	startUpload: function(event)
	{
		var self = this;

		if (self.uploading)
			return true;

		// Start the chain of one by one upload
		self.uploadFile(0, event);
	},

	/**
	 * Uploads a single file and then continues to the next until everything is finished
	 */
	uploadFile: function(i, event)
	{
		var self = this;
		self.current_index = i;
		self.upload_started = new Date().getTime() / 1000;
		self.last_uploaded = 0;
		self.last_update = self.upload_started;
		self.uploading = true;

		if (typeof(self.queued[i]) == 'undefined')
		{
			// We're done, the chain is finished and hence we will now reside peacfully in our den
			self.finishUpload();
			return true;
		}

		// Generate a base key for tracing progress
		self.base_key = new Date().getTime();

		// Set the basic progress reporting stuff
		var filename = $('<strong>' + self.getFileName(self.current_index) + '</strong>');
		filename.appendTo(self.progress_area);

		// The stop button
		$('<img alt="" border="0" style="cursor: pointer; cursor: hand; margin-right: 5px;" />')
			.attr('src', self.options.delete_img)
			.attr('id', 'img_' + i)
			.prependTo(filename)
			.click(function(event)
			{
				self.removeFile($(this).attr('id').substr(4), event);
			});

		// Showing some actual progress? Create the basic containers
		if (self.options.show_progress)
		{
			self.upload_status = $('<div></div>');
			self.upload_status.appendTo(self.progress_area);

			if (typeof $.fn.progressbar != 'undefined')
			{
				self.progress_bar = $('<div></div>');
				self.progress_bar.appendTo(self.progress_area);
				self.progress_bar.progressbar();
			}
		}

		// Remove the queued entry
		$('#q_' + i).remove();

		// Trigger the event
		self._trigger('start', event, {id: i});

		// XHR Upload?
		if (self.canXHRUpload())
		{
			self.timer = Date.getTime();
			var xhr = new XMLHttpRequest();
			self.current_xhr = xhr;
			xhr.open('POST', self.options.url + self.options.url_suffix.replace('%filename%', self.getFileName(i)), true);
			xhr.setRequestHeader("X-Requested-With", "XMLHttpRequest");
			xhr.setRequestHeader("X-File-Name", encodeURIComponent(self.getFileName(i)));
			xhr.setRequestHeader("Content-Type", "application/octet-stream");
			xhr.upload.onprogress = function(e)
			{
				if (e.lengthComputable)
					if ((Date.getTime() - self.timer) > 500)
					{
						self.timer = Date.getTime();
						self.updateProgress(e.loaded, e.total, e);
					}
			};
			xhr.onreadystatechange = function(e)
			{
				if (xhr.readyState == 4 && xhr.status == 200)
					self.uploadFinished($.parseJSON(xhr.responseText), e);
			};

			xhr.send(self.queued[i]);
		}
		// Standard iFrame upload!
		else
		{
			var form = $('<form action="' + self.options.url + '" method="post" enctype="multipart/form-data"></form>');
			form.hide();
			form.appendTo(document.body);
			$('<input type="hidden" name="UPLOAD_IDENTIFIER" />')
				.attr('value', self.base_key)
				.appendTo(form);
			self.queued[i].appendTo(form);

			// Start the progress trace
			self.traceProgress(event);

			self.current_xhr = $.iframeUpload(form, {
				dataType: 'json',
				data: {
					upload_id: i
				},
				success: function(response, status, event)
				{
					if (typeof(response) == 'undefined' || response.length == 0)
						return true;

					self.stopProgress();

					self.uploadFinished(response, event);
				},
				error: function(xhr, status, errorThrown)
				{
					self.uploadFinished({valid: false, error: 'upload_failed', status: status}, xhr);
				}
			});
		}
	},

	/**
	 * Finalises response and moves onto the next file
	 */
	uploadFinished: function(response, event)
	{
		if (typeof(response.valid) == 'undefined')
		{
			response = {
				valid: false,
				error: 'undefined'
			};
		}

		var self = this;

		self.progress_area.html('');
		var element = $('<div class="' + (response.valid ? 'success' : 'error') + '">' + self.getFileName(self.current_index) +  (response.valid ? '' : ' : (' + response.error + ')') + '</div>');
		element.appendTo(self.uploaded_area);

		self._trigger('finished', event, {response: response, id: self.current_index, element: element});

		self.uploadFile(self.current_index + 1, event);
	},

	/**
	 * Finishes the upload chain and resets to enable uploading
	 */
	finishUpload: function()
	{
		var self = this;
		self.uploading = false;
		self.current_index = null;
		self.queued = [];
	},

	/**
	 * Gives feedback of updated progress
	 */
	updateProgress: function(uploaded, total, event, _avg_speed, _speed)
	{
		var self = this;

		if (!self.options.show_progress)
			return true;

		// Calculate the speed and average speed along with total uploaded data
		var current = new Date().getTime() / 1000;
		var total_evaluated = current - self.upload_started;
		var evaluated = current - self.last_update;
		var speed = typeof(_speed) != 'undefined' ? _speed : (uploaded - self.last_uploaded) / evaluated;
		var avg_speed = typeof(_avg_speed) != 'undefined' ? Math.round((_avg_speed / 1024) * 100) / 100 : Math.round(((uploaded / 1024) / total_evaluated) * 100) / 100;

		// Progress event
		self._trigger('progress', event, {id: self.current_index, started: self.upload_started, since_last: evaluated, speed: speed, total: total, uploaded: uploaded});

		// Update the internal values for proper update trace
		self.last_update = current;
		self.last_uploaded = uploaded;

		// Convert the data into more sensible units
		speed = Math.round((speed / 1024) * 100) / 100;
		uploaded = Math.round((uploaded / (1024 * 1024)) * 100) / 100;
		total = Math.round((total / (1024 * 1024)) * 100) / 100;
		percent = Math.round((uploaded / total) * 100 * 100) / 100;

		// Speed's in MB/sec? Damn I want your nets
		if (speed > 900)
		{
			speed = Math.round((speed / 1024) * 100) / 100 + 'MB/sec';
			avg_speed = Math.round((avg_speed / 1024) * 100) / 100 + 'MB/sec';
		}
		else
		{
			speed = speed + 'KB/sec';
			avg_speed = avg_speed + 'KB/sec';
		}

		// Update the information
		if (typeof self.progress_bar != 'undefined')
			self.progress_bar.progressbar('value', percent);
		self.upload_status.html(percent + '%, ' + speed + ' (Avg. ' + avg_speed + ') (' + uploaded + 'MB of ' + total + 'MB)');
	},
	
	/**
	 * Starts tracing a progress
	 */
	traceProgress: function()
	{
		var self = this;

		if (!self.options.show_progress)
			return true;

		// Start tracing the progress
		self.progressInterval = setTimeout(function()
		{
			self.progressUpdate()
		}, 3500);
	},

	/**
	 * Updates the progress as it goes by
	 */
	progressUpdate: function()
	{
		var self = this;

		// Perform the request
		$.ajax({
			url: self.options.progress_url + '?id=' + self.base_key,
			type: 'POST',
			dataType: 'json',
			success: function(response, status, event)
			{
				if (!(event.responseText == 'null' || typeof(response.bytes_uploaded) == 'undefined'))
					self.updateProgress(response.bytes_uploaded, response.bytes_total, event, response.speed_average, response.speed_last);

				self.progressInterval = setTimeout(function()
				{
					self.progressUpdate()
				}, 1);
			}
		});
	},

	/**
	 * Stops the AJAX progress updates
	 */
	stopProgress: function()
	{
		var self = this;
		if (!self.options.show_progress)
			return true;

		clearInterval(self.progressInterval);
	},

	/**
	 * Returns the file name of a given element
	 */
	getFileName: function(i)
	{
		var self = this;
		if (self.canXHRUpload())
			return self.queued[i].fileName || self.queued[i].name;
		else
			return self.queued[i].val().substr(self.queued[i].val().lastIndexOf('\\') + 1);
	}
});

	/**
	 * Our lovely iFrame uploader, currently only supports JSON
	 */
	$.iframeUpload = function(form, options)
	{
		if (!$(form).is('form'))
			return false;
		return new $._iframeUpload(form, options);
	};

	$._iframeUpload = function(form, options)
	{
		var self = this;
		self.options = $.extend(self.defaultOpts, options);
		self.form = form;
		self.id = new Date().getTime() + '_upload';
		self.aborted = false;

		self.createiframe();
		self.upload();
	};

$.extend($._iframeUpload.prototype, {
	defaultOpts: {
		data: {}, // Data to be passed to events, this data is not actually passed ith the form
		success: null, // Success event
		error: null, // Error event, actually doesn't do anything since I couldn't figure out how to throw error :P
		beforeUpload: null // Event fired just before upload
	},

	// Creates the iframe and appends the form
	createiframe: function()
	{
		var self = this;

		self.iframe = $('<iframe style="display: none;"></iframe>')
			.attr('name', self.id)
			.attr('id', self.id)
			.attr('src', 'javascript:false;');
		self.iframe.appendTo('body');

		// Add in the form
		self.form.attr('target', self.id).hide().appendTo('body');
	},

	// Uploads the file via the iframe
	upload: function()
	{
		var self = this;

		if (typeof self.options.beforeUpload == 'function')
			self.options.beforeUpload.apply(self);

		// Assign the event
		self.iframe.load(function()
		{
			self.loadEvent();
		});

		// Submit the form
		self.form.submit();
	},

	loadEvent: function(event)
	{
		var self = this;

		if (self.aborted)
			return false;

		var body = self.iframe.contents().find('body');

		if ($(body).find('pre'))
			var response = $(body).find('pre').html();
		else
			var response = $(body).html();

		// Parse the request
		response = $.parseJSON(response);

		// Set the event
		if (typeof self.options.success == 'function')
			self.options.success.apply(self, [response, 'success', event]);
	},

	// Aborts an iframe upload
	abort: function()
	{
		self.aborted = true;
		self.iframe.attr('src', 'javascript:false;');
	}
});
})(jQuery);