#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D u_card;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_seed;
uniform bool u_is_foil;
varying vec2 v_uv;

// Xantho sends her spell-moths from the raised hand across the river opening.
float oval(vec2 p,vec2 c,vec2 r) {
    return 1.0-smoothstep(0.45,1.0,length((p-c)/r));
}
float hash(float n) { return fract(sin(n*127.1+73.7)*43758.5453); }
float segment(vec2 p,vec2 a,vec2 b) {
    vec2 d=b-a;
    return length(p-a-d*clamp(dot(p-a,d)/dot(d,d),0.0,1.0));
}
vec2 flight(float f,float lane,float phase) {
    // The alternating arcs suggest the sideways movement of Concentration.
    return vec2(0.438+f*0.499,
        0.244-0.070*sin(f*3.1415926)+0.058*f*lane
        +0.013*sin(f*17.0+phase)*sin(f*3.1415926));
}
void main() {
    vec2 p=vec2(v_uv.x,1.0-v_uv.y);
    vec4 scan=texture2D(u_card,v_uv);
    float aa=max(0.0007,0.7/max(u_resolution.x,1.0));
    float t=u_time;
    float seed=u_seed*0.137;
    // Hard exterior of soft mask protects title, shields, and all lower stats.
    float art=smoothstep(0.140,0.155,p.y)*(1.0-smoothstep(0.544,0.563,p.y));
    art*=smoothstep(0.017,0.035,p.x)*(1.0-smoothstep(0.963,0.986,p.x));
    art*=clamp(smoothstep(0.172,0.196,p.x)+smoothstep(0.298,0.321,p.y),0.0,1.0);
    float falls=oval(p,vec2(0.753,0.410),vec2(0.113,0.159));
    float hair=oval(p,vec2(0.266,0.309),vec2(0.051,0.138));
    vec2 warp=vec2(0.0014*sin(p.y*62.0-t*2.4)*hair,
        0.0014*sin(p.y*84.0-t*4.5)*falls)*art;
    vec3 col=texture2D(u_card,v_uv+vec2(warp.x,-warp.y)).rgb;
    float light=dot(scan.rgb,vec3(0.299,0.587,0.114));
    // Water ribbons visibly descend behind the figure, retaining the warm gorge.
    float water=pow(0.5+0.5*sin(p.y*93.0-t*4.7+sin(p.x*49.0)*1.8),9.0);
    float channels=0.45+0.55*pow(0.5+0.5*sin(p.x*157.0+p.y*9.0),3.0);
    col+=falls*water*channels*vec3(0.105,0.18,0.17);
    col*=1.0-falls*(1.0-water)*0.045;

    float moths=0.0;
    float bodies=0.0;
    float halo=0.0;
    float trails=0.0;
    for(int i=0;i<13;i++) {
        float fi=float(i);
        float lane=mod(fi,3.0)-1.0;
        float phase=fi*2.39+seed;
        float f=fract(t*(0.090+hash(fi)*0.025)+fi*0.077+seed);
        vec2 c=flight(f,lane,phase);
        vec2 q=p-c;
        q.y*=1.41;
        float angle=-0.38+0.65*cos(f*6.283+phase);
        q=mat2(cos(angle),-sin(angle),sin(angle),cos(angle))*q;
        float wing=0.28+0.72*abs(sin(t*12.0+phase));
        float scale=0.75+hash(fi+5.0)*0.45;
        vec2 wingCenter=vec2(0.009*wing,0.0015)*scale;
        vec2 wingSize=vec2(0.009*wing+0.002,0.008)*scale;
        float d1=length((q-wingCenter)/wingSize);
        float d2=length((q+wingCenter)/wingSize);
        float feather=1.0-smoothstep(0.55,1.0+aa*28.0,min(d1,d2));
        float envelope=smoothstep(0.0,0.08,f)*(1.0-smoothstep(0.91,1.0,f));
        moths+=feather*envelope;
        bodies+=(1.0-smoothstep(0.0012,0.0012+aa,
            length(q*vec2(1.0,0.40))))*envelope;
        halo+=exp(-dot(q,q)/0.00038)*envelope;
        vec2 tail=flight(max(0.0,f-0.045),lane,phase);
        float d=segment(p,c,tail);
        trails+=(1.0-smoothstep(0.001,0.0025+aa,d))*envelope*0.22;
    }
    col+=vec3(0.13,0.045,0.25)*halo;
    col=mix(col,vec3(0.65,0.40,0.88),clamp(moths*0.82,0.0,0.9));
    col+=vec3(0.29,0.24,0.40)*bodies+vec3(0.34,0.14,0.52)*trails;
    float palm=oval(p,vec2(0.432,0.242),vec2(0.032,0.027));
    col+=palm*vec3(0.20,0.045,0.28)*(0.55+0.45*sin(t*3.6+seed));
    // The painted butterflies also flash as the moving flock passes them.
    float painted=oval(p,vec2(0.517,0.199),vec2(0.047,0.035))
        +oval(p,vec2(0.824,0.227),vec2(0.047,0.030))
        +oval(p,vec2(0.915,0.276),vec2(0.049,0.031));
    float lavender=smoothstep(0.015,0.14,scan.b-scan.g);
    col+=painted*lavender*vec3(0.15,0.08,0.23)*(0.5+0.5*sin(t*9.0+p.x*29.0));
    if(u_is_foil) {
        // Interference follows the river, silken hair and moth wings; a colored
        // metallic substrate is already readable when time is frozen at zero.
        float phase=p.x*1.8+p.y*2.7+sin(p.y*31.0)*0.055-t*0.14+seed;
        vec3 hue=0.5+0.5*cos(6.2831853*(phase+vec3(0.0,0.33,0.67)));
        vec3 overlay=mix(2.0*col*hue,
            1.0-2.0*(1.0-col)*(1.0-hue),step(vec3(0.5),col));
        col=mix(col,overlay,0.33);
        float metal=clamp(falls*0.7+hair+painted*lavender+moths,0.0,1.0);
        float band=pow(0.5+0.5*sin(p.x*26.0-p.y*21.0-t*2.2+seed),12.0);
        col+=metal*(0.2+0.8*smoothstep(0.15,0.65,light))
            *(hue*0.14+(hue*0.6+vec3(0.20,0.27,0.33))*band*0.34);
    }
    gl_FragColor=vec4(mix(scan.rgb,clamp(col,0.0,1.0),art),scan.a);
}
