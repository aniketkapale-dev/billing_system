"""
Server-rendered page shells for the admin panel.

These views only render the HTML scaffold; all data is loaded client-side via
the REST API (JWT in the browser). Page guarding is done in JS (token check),
so these endpoints simply return the templates.
"""
import logging

from django import forms
from django.core.paginator import Paginator
from django.shortcuts import render
from django.conf import settings
from django.db import transaction

logger = logging.getLogger(__name__)


