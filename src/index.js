import { stringify } from 'query-string';
import fetchJson from './fetch';

import {
    GET_LIST,
    GET_ONE,
    GET_MANY,
    GET_MANY_REFERENCE,
    CREATE,
    UPDATE,
    UPDATE_MANY,
    DELETE,
    DELETE_MANY,
} from 'react-admin';

export * from './authProvider';
export { default as storage } from './storage';

export default (apiUrl, httpClient = fetchJson) => {
  /**
   * @param {String} type One of the constants appearing at the top if this file, e.g. 'UPDATE'
   * @param {String} resource Name of the resource to fetch, e.g. 'posts'
   * @param {Object} params The data request params, depending on the type
   * @returns {Object} { url, options } The HTTP request parameters
   */
  const convertDataRequestToHTTP = (type, resource, params) => {
    let url = '';
    const options = {};
    const specialParams = ['pagination', 'sort', 'filter'];
    switch (type) {
      case GET_LIST: {
        const { page, perPage } = params.pagination;
        const { field, order } = params.sort;

        const rangeStart = (page - 1) * perPage;
        const rangeEnd = page * perPage - 1;

        const query = {};
        query['where'] = {...params.filter};
        if (field) query['order'] = [field + ' ' + order];
        if (perPage >= 0) query['limit'] = perPage;
        if ((perPage > 0) && (page >= 0)) query['skip'] = (page - 1) * perPage;

        Object.keys(params).forEach(key => {
          if (!specialParams.includes(key) && params[key] !== undefined)
            query[key] = params[key];
        });
        url = `${apiUrl}/${resource}?${stringify({filter: JSON.stringify(query)})}`;
        options.headers = new Headers({
          'Range': `${resource}=${rangeStart}-${rangeEnd}`
        });

        break;
      }
      case GET_ONE:
        url = `${apiUrl}/${resource}/${params.id}`;
        break;
      case GET_MANY: {
        const listId = params.ids.map(id => {
          return {id};
        });

        let query = '';
        if (listId.length > 0) {
          const filter = {
            where: {or: listId},
          };
          query = `?${stringify({filter: JSON.stringify(filter)})}`;
        }
        url = `${apiUrl}/${resource}${query}`;
        break;
      }
      case GET_MANY_REFERENCE: {
        const { page, perPage } = params.pagination;
        const { field, order } = params.sort;

        const rangeStart = (page - 1) * perPage;
        const rangeEnd = page * perPage - 1;

        const query = {};
        query['where'] = {...params.filter};
        query['where'][params.target] = params.id;
        if (field) query['order'] = [field + ' ' + order];
        if (perPage >= 0) query['limit'] = perPage;
        if ((perPage > 0) && (page >= 0)) query['skip'] = (page - 1) * perPage;

        Object.keys(params).forEach(key => {
          if (!specialParams.includes(key) && params[key] !== undefined)
            query[key] = params[key];
        });

        url = `${apiUrl}/${resource}?${stringify({filter: JSON.stringify(query)})}`;
        options.headers = new Headers({
          'Range': `${resource}=${rangeStart}-${rangeEnd}`
        });

        break;
      }
      case UPDATE:
        url = `${apiUrl}/${resource}/${params.id}`;
        options.method = 'PATCH';
        options.body = JSON.stringify(params.data);
        break;
      case CREATE:
        url = `${apiUrl}/${resource}`;
        options.method = 'POST';
        options.body = JSON.stringify(params.data);
        break;
      case DELETE:
        url = `${apiUrl}/${resource}/${params.id}`;
        options.method = 'DELETE';
        break;
      default:
        throw new Error(`Unsupported fetch action type ${type}`);
    }
    return { url, options };
  };

  /**
   * @param {Object} response HTTP response from fetch()
   * @param {String} type One of the constants appearing at the top if this file, e.g. 'UPDATE'
   * @param {String} resource Name of the resource to fetch, e.g. 'posts'
   * @param {Object} params The data request params, depending on the type
   * @returns {Object} Data response
   */
  const convertHTTPResponse = (response, type, resource, params) => {
    const { headers, json } = response;
    switch (type) {
      case GET_LIST:
      case GET_MANY_REFERENCE:
        if (!headers.has('content-range')) {
          throw new Error(
            'The Content-Range header is missing in the HTTP Response. The simple REST data provider expects responses for lists of resources to contain this header with the total number of results to build the pagination. If you are using CORS, did you declare Content-Range in the Access-Control-Expose-Headers header?'
          );
        }
        return {
          data: json,
          total: parseInt(
            headers
              .get('content-range')
              .split('/')
              .pop(),
              10
          ),
        };
      case CREATE:
        return { data: { ...params.data, id: json.id } };
      case DELETE:
        return { data: { ...json, id: params.id } };
      default:
        return { data: json };
    }
  };

  /**
   * @param {string} type Request type, e.g GET_LIST
   * @param {string} resource Resource name, e.g. "posts"
   * @param {Object} payload Request parameters. Depends on the request type
   * @returns {Promise} the Promise for a data response
   */
  return (type, resource, params) => {
    // simple-rest doesn't handle filters on UPDATE route, so we fallback to calling UPDATE n times instead
    if (type === UPDATE_MANY) {
      return Promise.all(
        params.ids.map(id =>
          httpClient(`${apiUrl}/${resource}/${id}`, {
            method: 'PUT',
            body: JSON.stringify(params.data),
          })
        )
      ).then(responses => ({
        data: responses.map(response => response.json),
      }));
    }
    // simple-rest doesn't handle filters on DELETE route, so we fallback to calling DELETE n times instead
    if (type === DELETE_MANY) {
      return Promise.all(
        params.ids.map(id =>
          httpClient(`${apiUrl}/${resource}/${id}`, {
            method: 'DELETE',
          })
        )
      ).then(responses => ({
        data: responses.map(response => response.json),
      }));
    }

    const { url, options } = convertDataRequestToHTTP(
      type,
      resource,
      params
    );
    
    return httpClient(url, options).then(response =>
        convertHTTPResponse(response, type, resource, params)
    );
  };
};